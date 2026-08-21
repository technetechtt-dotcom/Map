import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canManageUsers, isSuperAdmin } from "@/lib/policy";
import { invitationAcceptSchema } from "@/lib/validation";
import { clientIp, readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { assertStrongPassword } from "@/lib/password";
import { notify } from "@/lib/notify";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Super/provincial admin creates invitation */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageUsers(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    email?: string;
    role?: string;
    provinceId?: string | null;
    organisationId?: string | null;
  };
  if (!body.email || !body.role) return jsonError("email and role required");
  if (body.role === "SUPER_ADMIN" && !isSuperAdmin(auth.user)) {
    return jsonError("Cannot invite super admin", 403);
  }

  const allowed = ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"] as const;
  if (!allowed.includes(body.role as (typeof allowed)[number])) {
    return jsonError("Invalid role", 400);
  }

  let provinceId = body.provinceId ?? null;
  if (!isSuperAdmin(auth.user)) {
    provinceId = auth.user.provinceId || null;
  }

  if (body.role === "ORG_ADMIN" && !body.organisationId) {
    return jsonError("Organisation is required for organisation administrators", 400);
  }
  if (body.organisationId) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: body.organisationId },
      select: { id: true, provinceId: true },
    });
    if (!organisation) return jsonError("Organisation not found", 404);
    if (!isSuperAdmin(auth.user) && organisation.provinceId !== provinceId) {
      return jsonError("Organisation is outside your province scope", 403);
    }
    if (provinceId && organisation.provinceId && organisation.provinceId !== provinceId) {
      return jsonError("Organisation and province must match", 400);
    }
    provinceId = provinceId || organisation.provinceId;
  }

  const token = randomBytes(32).toString("hex");
  const inv = await prisma.adminInvitation.create({
    data: {
      email: body.email.toLowerCase(),
      role: body.role as (typeof allowed)[number],
      provinceId,
      organisationId: body.organisationId || null,
      tokenHash: hashToken(token),
      invitedById: auth.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "INVITE_USER",
    entityType: "AdminInvitation",
    entityId: inv.id,
    provinceId,
    ipAddress: clientIp(req),
    metadata: { email: inv.email, role: inv.role },
  });

  const origin = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const acceptPath = `/accept-invite?token=${token}`;
  const acceptUrl = origin ? `${origin}${acceptPath}` : acceptPath;
  const subject = "You were invited to the SA ICT Ecosystem Map";
  const emailBody = `Use this link to accept your invitation (expires ${inv.expiresAt.toISOString()}):\n${acceptUrl}`;
  const production = process.env.NODE_ENV === "production" && process.env.E2E !== "1";
  if (production && !process.env.RESEND_API_KEY && !process.env.NOTIFY_WEBHOOK_URL) {
    await prisma.adminInvitation.delete({ where: { id: inv.id } }).catch(() => undefined);
    return jsonError("Invitation email is not configured (RESEND_API_KEY or NOTIFY_WEBHOOK_URL)", 503);
  }

  const queued = await notify({
    type: "invite",
    to: inv.email,
    subject,
    body: emailBody,
    meta: { invitationId: inv.id },
  });
  if (production && !queued) return jsonError("Invitation could not be queued for delivery", 503);

  return jsonOk({
    invitation: { id: inv.id, email: inv.email, expiresAt: inv.expiresAt },
    queued: Boolean(queued),
    acceptPath: production ? "/accept-invite" : acceptPath,
    ...(production ? {} : { acceptToken: token }),
  });
}

/** Accept invitation and create user with forced password change flag cleared (password set now) */
export async function PUT(req: NextRequest) {
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = invitationAcceptSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Invalid request", 400);
  const strength = await assertStrongPassword(body.data.password);
  if (!strength.ok) return jsonError(strength.error, 400);

  const tokenHash = hashToken(body.data.token);
  const inv = await prisma.adminInvitation.findUnique({ where: { tokenHash } });
  if (!inv || inv.acceptedAt || inv.expiresAt.getTime() < Date.now()) {
    return jsonError("Invalid or expired invitation", 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: inv.email } });
  if (existing) return jsonError("Account already exists", 409);

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: inv.email,
        name: body.data.name,
        passwordHash,
        role: inv.role,
        provinceId: inv.provinceId,
        organisationId: inv.organisationId,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await tx.adminInvitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });
    return u;
  });

  await writeAudit({
    userId: user.id,
    action: "ACCEPT_INVITE",
    entityType: "User",
    entityId: user.id,
    provinceId: user.provinceId,
  });

  return jsonOk({ ok: true, email: user.email });
}
