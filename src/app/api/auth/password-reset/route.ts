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
  const limited = await enforceRateLimitAsync(req, "pwd-reset", { limit: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = passwordResetRequestSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Invalid request", 400);

  const email = body.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    // Production: send email with link. Dev: log token when ALLOW_LOG_RESET_TOKEN=1
    if (process.env.ALLOW_LOG_RESET_TOKEN === "1" || process.env.NODE_ENV !== "production") {
      log.info("password_reset.token_issued", {
        email,
        // Never log full token in production unless explicitly allowed
        tokenPreview: process.env.ALLOW_LOG_RESET_TOKEN === "1" ? token : token.slice(0, 6) + "…",
      });
    }
    // Surface token only in non-production for local workflow
    if (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOG_RESET_TOKEN === "1") {
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
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
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
    subject: "SA ICT Map password was reset",
    body: "A password reset completed for this account.",
    meta: { userId: row.userId },
  });

  return jsonOk({ ok: true });
}
