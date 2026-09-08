import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";
import { assertStrongPassword } from "@/lib/password";
import { clientIp, readJsonLimited } from "@/lib/security";
import { log } from "@/lib/logger";

const signupSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
  provinceId: z.string().min(1).max(100),
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
  const name = body.data.name;
  const strength = await assertStrongPassword(body.data.password);
  if (!strength.ok) return jsonError(strength.error, 400);

  const province = await prisma.province.findUnique({
    where: { id: body.data.provinceId },
    select: { id: true },
  });
  if (!province) return jsonError("Province not found", 400);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return jsonError("An account with this email already exists", 409);

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: "CONTRIBUTOR",
          provinceId: province.id,
          active: true,
          mustChangePassword: false,
          mfaEnabled: false,
        },
      });
      // Browser tests use disposable users. Production and normal development
      // retain the immutable signup audit record.
      if (process.env.E2E !== "1" || process.env.NODE_ENV === "production") {
        await tx.auditLog.create({
          data: {
            userId: created.id,
            actorEmail: created.email,
            actorName: created.name,
            actorRole: created.role,
            action: "SIGNUP",
            entityType: "User",
            entityId: created.id,
            metadataJson: { email: created.email, role: created.role },
            ipAddress: clientIp(req),
            provinceId: province.id,
          },
        });
      }
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("An account with this email already exists", 409);
    }
    log.error("auth.signup_error", {
      email,
      detail: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Could not create account", 500);
  }

  log.info("auth.signup", { email: user.email, role: user.role, provinceId: user.provinceId });

  return jsonOk(
    {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      message: "Account created. You can sign in now.",
    },
    201
  );
}
