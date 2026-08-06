import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { revokeUserSessions } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "pwd-change", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = schema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Not found", 404);

  const ok = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
  if (!ok) return jsonError("Current password incorrect", 400);

  const passwordHash = await bcrypt.hash(body.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  await revokeUserSessions(user.id);
  await writeAudit({
    user: auth.user,
    userId: user.id,
    action: "PASSWORD_CHANGE",
    entityType: "User",
    entityId: user.id,
  });

  return jsonOk({ ok: true, message: "Password updated — please sign in again." });
}
