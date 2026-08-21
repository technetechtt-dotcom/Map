import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { requiresMfa } from "@/lib/policy";
import { generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "@/lib/totp";
import { currentMfaKeyVersion, decryptSecret, encryptSecret, primeMfaDataKey } from "@/lib/secret-box";
import { notify } from "@/lib/notify";
import { invalidateSessionCache } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { clientIp } from "@/lib/security";

function recoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString("hex"));
}

/** Start MFA enrollment — returns base32 secret + otpauth URI (authenticator apps). */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "mfa-setup", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    action?: "enroll" | "reset";
    currentPassword?: string;
    existingMfaCode?: string;
  };
  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Not found", 404);
  let verifiedRecoveryHashes: string[] | undefined;

  if (user.mfaEnabled) {
    if (body.action !== "reset") {
      return jsonError("Use the explicit reset MFA workflow", 409);
    }
    if (requiresMfa(auth.user)) {
      return jsonError("Privileged accounts require a super administrator to reset MFA", 403);
    }
    if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      return jsonError("Current password is required", 400);
    }
    const verified = await verifyExistingFactor(user, body.existingMfaCode || "");
    if (!verified.ok) return jsonError("Existing MFA or recovery code is required", 400);
    verifiedRecoveryHashes = verified.remainingHashes;
  }

  const keyVersion = currentMfaKeyVersion();
  await primeMfaDataKey(keyVersion);
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      mfaPendingSecret: encryptSecret(secret, keyVersion),
      mfaPendingKeyVersion: keyVersion,
      ...(verifiedRecoveryHashes !== undefined
        ? { mfaRecoveryHashes: verifiedRecoveryHashes }
        : {}),
    },
  });

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: user.mfaEnabled ? "MFA_RESET_START" : "MFA_SETUP_START",
    entityType: "User",
    entityId: auth.user.id,
    ipAddress: clientIp(req),
  });

  return jsonOk({
    secret,
    otpauthUrl: otpauthUri({
      secretBase32: secret,
      accountName: auth.user.email || auth.user.id,
    }),
    sampleCode: process.env.NODE_ENV === "production" ? undefined : totpCode(secret),
    note: "Scan otpauthUrl or enter secret in your authenticator. PUT with 6-digit code to enable.",
    required: requiresMfa(auth.user),
    reset: user.mfaEnabled,
  });
}

type MfaUser = {
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaKeyVersion: number;
  mfaRecoveryHashes: unknown;
};

async function verifyExistingFactor(
  user: MfaUser,
  code: string
): Promise<{ ok: boolean; remainingHashes?: string[] }> {
  if (!user.mfaEnabled || !code.trim()) return { ok: false };
  if (user.mfaSecret) {
    try {
      await primeMfaDataKey(user.mfaKeyVersion);
      if (verifyTotp(decryptSecret(user.mfaSecret, user.mfaKeyVersion), code)) return { ok: true };
    } catch {
      return { ok: false };
    }
  }
  const hashes = Array.isArray(user.mfaRecoveryHashes)
    ? (user.mfaRecoveryHashes as string[])
    : [];
  for (let i = 0; i < hashes.length; i += 1) {
    if (await bcrypt.compare(code, hashes[i])) {
      return { ok: true, remainingHashes: hashes.filter((_, index) => index !== i) };
    }
  }
  return { ok: false };
}

/** Confirm MFA enable with a valid TOTP, or disable with password. */
export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    action?: "enable" | "disable";
    code?: string;
    password?: string;
    existingMfaCode?: string;
  };

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Not found", 404);

  if (body.action === "disable") {
    if (!body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return jsonError("Password required to disable MFA", 400);
    }
    if (requiresMfa(auth.user) && process.env.MFA_ENFORCE !== "0") {
      return jsonError("MFA is mandatory for your role", 403);
    }
    const verified = await verifyExistingFactor(user, body.existingMfaCode || "");
    if (!verified.ok) return jsonError("Existing MFA or recovery code is required", 400);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaPendingSecret: null,
        mfaPendingKeyVersion: null,
        mfaRecoveryHashes: [],
        sessionVersion: { increment: 1 },
      },
    });
    await invalidateSessionCache(user.id);
    await writeAudit({
      user: auth.user,
      userId: user.id,
      action: "MFA_DISABLE",
      entityType: "User",
      entityId: user.id,
      ipAddress: clientIp(req),
    });
    await notify({
      type: "mfa.disabled",
      to: user.email,
      userId: user.id,
      subject: "MFA disabled on your SA ICT Map account",
      body: "Multi-factor authentication was disabled on your account.",
    });
    return jsonOk({ mfaEnabled: false });
  }

  if (!user.mfaPendingSecret || !user.mfaPendingKeyVersion) {
    return jsonError("Call POST to start MFA setup first", 400);
  }
  let plain: string;
  try {
    await primeMfaDataKey(user.mfaPendingKeyVersion);
    plain = decryptSecret(user.mfaPendingSecret, user.mfaPendingKeyVersion);
  } catch {
    return jsonError("MFA secret could not be decrypted — contact an administrator", 500);
  }
  if (!verifyTotp(plain, body.code || "")) {
    return jsonError("Invalid MFA code", 400);
  }

  const codes = recoveryCodes();
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaSecret: user.mfaPendingSecret,
      mfaKeyVersion: user.mfaPendingKeyVersion,
      mfaPendingSecret: null,
      mfaPendingKeyVersion: null,
      mfaRecoveryHashes: hashes,
      sessionVersion: { increment: 1 },
    },
  });
  await invalidateSessionCache(user.id);
  await writeAudit({
    user: auth.user,
    userId: user.id,
    action: user.mfaEnabled ? "MFA_RESET_COMPLETE" : "MFA_ENABLE",
    entityType: "User",
    entityId: user.id,
    ipAddress: clientIp(req),
  });
  await notify({
    type: user.mfaEnabled ? "mfa.reset" : "mfa.enabled",
    to: user.email,
    userId: user.id,
    subject: `${user.mfaEnabled ? "MFA reset" : "MFA enabled"} on your SA ICT Map account`,
    body: `Multi-factor authentication was ${user.mfaEnabled ? "reset" : "enabled"}. All previous sessions have been revoked.`,
  });
  return jsonOk({
    mfaEnabled: true,
    recoveryCodes: codes,
    note: "Store recovery codes offline. They are shown once.",
  });
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { mfaEnabled: true, mustChangePassword: true, role: true },
  });
  return jsonOk({
    mfaEnabled: user?.mfaEnabled ?? false,
    mustChangePassword: user?.mustChangePassword ?? false,
    mfaRequired: requiresMfa(auth.user),
  });
}
