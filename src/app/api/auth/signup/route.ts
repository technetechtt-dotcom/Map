import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";
import { assertStrongPassword } from "@/lib/password";
import { clientIp, readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { log } from "@/lib/logger";

const signupSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(2).max(120),
  password: z.string().min(12).max(128),
});

/**
 * Public self-signup — creates an active CONTRIBUTOR on the shared Neon DB.
 * Available on both public and ops origins.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "signup", { limit: 8, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = signupSchema.safeParse(parsed.data);
  if (!body.success) {
    return jsonError("Validation failed", 400, { issues: body.error.issues });
  }

  const email = body.data.email.toLowerCase().trim();
  const name = body.data.name.trim();
  const strength = await assertStrongPassword(body.data.password);
  if (!strength.ok) return jsonError(strength.error, 400);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return jsonError("An account with this email already exists", 409);

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "CONTRIBUTOR",
      active: true,
      mustChangePassword: false,
      mfaEnabled: false,
    },
  });

  await writeAudit({
    user: { id: user.id, role: user.role },
    userId: user.id,
    action: "SIGNUP",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
    ipAddress: clientIp(req),
  });
  log.info("auth.signup", { email: user.email, role: user.role });

  return jsonOk(
    {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      message: "Account created. You can sign in now.",
    },
    201
  );
}
