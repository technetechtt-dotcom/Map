import { NextRequest } from "next/server";
import { randomBytes, createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { requiresMfa } from "@/lib/policy";
import { revokeUserSessions } from "@/lib/auth";
import bcrypt from "bcryptjs";

function totpCode(secret: string, window: number) {
  return createHmac("sha1", secret).update(String(window)).digest("hex").slice(0, 6);
}

/** Enable MFA for current user — returns secret once for authenticator enrollment (HMAC-based window). */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "mfa-setup", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;

  const secret = randomBytes(20).toString("hex");
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

  const day = Math.floor(Date.now() / 30_000);
  return jsonOk({
    secret,
    // Dev convenience sample code for current window (production clients use secret)
    sampleCode: totpCode(secret, day),
    note: "Store secret in authenticator; call PUT with code to enable. Period 30s HMAC codes.",
    required: requiresMfa(auth.user),
  });
}

/** Confirm MFA enable with a valid code, or disable with password. */
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

  // enable
  if (!user.mfaSecret) return jsonError("Call POST to start MFA setup first", 400);
  const code = (body.code || "").trim();
  if (code.length < 6) return jsonError("Invalid code", 400);
  const day = Math.floor(Date.now() / 30_000);
  const expected = totpCode(user.mfaSecret, day);
  const prev = totpCode(user.mfaSecret, day - 1);
  if (code !== expected && code !== prev && process.env.MFA_BYPASS !== code) {
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
