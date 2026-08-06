import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { requiresMfa } from "@/lib/policy";
import { revokeUserSessions } from "@/lib/auth";
import { generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "@/lib/totp";
import bcrypt from "bcryptjs";

/** Start MFA enrollment — returns base32 secret + otpauth URI (authenticator apps). */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "mfa-setup", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { mfaSecret: secret, mfaEnabled: false },
  });

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "MFA_SETUP_START",
    entityType: "User",
    entityId: auth.user.id,
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
  });
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
  };

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Not found", 404);

  if (body.action === "disable") {
    if (!body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return jsonError("Password required to disable MFA", 400);
    }
    if (requiresMfa(auth.user) && process.env.MFA_ENFORCE === "1") {
      return jsonError("MFA is mandatory for your role", 403);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, sessionVersion: { increment: 1 } },
    });
    await revokeUserSessions(user.id);
    await writeAudit({
      user: auth.user,
      userId: user.id,
      action: "MFA_DISABLE",
      entityType: "User",
      entityId: user.id,
    });
    return jsonOk({ mfaEnabled: false });
  }

  if (!user.mfaSecret) return jsonError("Call POST to start MFA setup first", 400);
  if (!verifyTotp(user.mfaSecret, body.code || "")) {
    return jsonError("Invalid MFA code", 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });
  await writeAudit({
    user: auth.user,
    userId: user.id,
    action: "MFA_ENABLE",
    entityType: "User",
    entityId: user.id,
  });
  return jsonOk({ mfaEnabled: true });
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
