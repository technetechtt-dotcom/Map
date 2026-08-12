import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { revokeUserSessions } from "@/lib/auth";
import { assertStrongPassword, PASSWORD_HISTORY_KEEP, wasPasswordReused } from "@/lib/password";
import { notify } from "@/lib/notify";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "pwd-change", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = schema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });

  const strength = await assertStrongPassword(body.data.newPassword);
  if (!strength.ok) return jsonError(strength.error, 400);

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    include: { passwordHistories: { orderBy: { createdAt: "desc" }, take: PASSWORD_HISTORY_KEEP } },
  });
  if (!user) return jsonError("Not found", 404);

  const ok = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
  if (!ok) return jsonError("Current password incorrect", 400);

  const prior = [user.passwordHash, ...user.passwordHistories.map((h) => h.passwordHash)];
  if (await wasPasswordReused(body.data.newPassword, prior)) {
    return jsonError("Cannot reuse a recent password", 400);
  }

  const passwordHash = await bcrypt.hash(body.data.newPassword, 12);
  await prisma.$transaction([
    prisma.passwordHistory.create({
      data: { userId: user.id, passwordHash: user.passwordHash },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    }),
  ]);
  await revokeUserSessions(user.id);
  await writeAudit({
    user: auth.user,
    userId: user.id,
    action: "PASSWORD_CHANGE",
    entityType: "User",
    entityId: user.id,
  });
  await notify({
    type: "password.changed",
    to: user.email,
    subject: "Your SA ICT Map password was changed",
    body: "If you did not change your password, contact an administrator immediately.",
  });

  return jsonOk({ ok: true, message: "Password updated — please sign in again." });
}
