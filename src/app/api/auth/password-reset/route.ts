import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";
import { passwordResetRequestSchema, passwordResetSchema } from "@/lib/validation";
import { clientIp, readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { assertStrongPassword } from "@/lib/password";
import { notify } from "@/lib/notify";
import { invalidateSessionCache } from "@/lib/auth";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Request password reset — always returns ok to avoid email enumeration */
export async function POST(req: NextRequest) {
  // IP-based rate limiting
  const limited = await enforceRateLimitAsync(req, "pwd-reset-ip", { limit: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = passwordResetRequestSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Invalid request", 400);

  const email = body.data.email.toLowerCase().trim();

  // Account-level rate limiting
  const accountLimited = await enforceRateLimitAsync(req, `pwd-reset:acc:${email}`, { limit: 3, windowMs: 15 * 60_000 });
  if (accountLimited) return accountLimited;

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    // Invalidate/expire any existing outstanding tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiry
      },
    });

    const isProd = process.env.NODE_ENV === "production";
    const origin = process.env.PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://ictmap.gov.za";
    const resetUrl = `${origin.replace(/\/$/, "")}/reset-password?token=${token}`;

    // Send reset email via notifications system
    await notify({
      type: "password.reset_request",
      to: user.email,
      userId: user.id,
      subject: "Reset your SA ICT Map password",
      body: `A password reset request was received for your account. Reset your password by visiting this link: ${resetUrl}. This link is valid for 1 hour. If you did not request this, please ignore this email.`,
      meta: { userId: user.id },
    });

    // In production, tokens NEVER appear in logs or JSON under any circumstances
    if (!isProd) {
      if (process.env.ALLOW_LOG_RESET_TOKEN === "1") {
        log.info("password_reset.dev_token_issued", { email, token });
      }
      return jsonOk({
        ok: true,
        message: "If the account exists, a reset link was issued.",
        devToken: token,
        resetPath: `/reset-password?token=${token}`,
      });
    }
  }

  return jsonOk({ ok: true, message: "If the account exists, a reset link was issued." });
}

/** Complete password reset with token */
export async function PUT(req: NextRequest) {
  // Rate limit completion attempts to prevent brute forcing
  const limited = await enforceRateLimitAsync(req, "pwd-reset-complete", { limit: 10, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = passwordResetSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Invalid request", 400);

  const tokenHash = hashToken(body.data.token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return jsonError("Invalid or expired token", 400);
  }

  const strength = await assertStrongPassword(body.data.password);
  if (!strength.ok) return jsonError(strength.error, 400);

  const passwordHash = await bcrypt.hash(body.data.password, 12);

  // Invalidate all active sessions, mark token as used, and invalidate any remaining tokens
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 }, // Revokes all active user sessions
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  await invalidateSessionCache(row.userId);

  await writeAudit({
    userId: row.userId,
    action: "PASSWORD_RESET",
    entityType: "User",
    entityId: row.userId,
    ipAddress: clientIp(req),
  });

  const resetUser = await prisma.user.findUnique({ where: { id: row.userId }, select: { email: true } });
  await notify({
    type: "password.reset",
    to: resetUser?.email,
    userId: row.userId,
    subject: "Security Alert: Your SA ICT Map password was reset",
    body: "Your password for the SA ICT Map was successfully reset. If you did not make this change, contact your security administrator immediately.",
    meta: { userId: row.userId },
  });

  return jsonOk({ ok: true, message: "Password updated successfully" });
}
