import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { writeAudit } from "@/lib/audit";
import { canManageUsers, isSuperAdmin } from "@/lib/policy";
import { userCreateSchema } from "@/lib/validation";
import { readJsonLimited } from "@/lib/security";
import { notify } from "@/lib/notify";
import { clientIp } from "@/lib/security";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageUsers(auth.user)) return jsonError("Forbidden", 403);

  const where = isSuperAdmin(auth.user)
    ? {}
    : { provinceId: auth.user.provinceId || "__none__" };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      provinceId: true,
      organisationId: true,
      mustChangePassword: true,
      mfaEnabled: true,
      sessionVersion: true,
      lastLoginAt: true,
      lockedUntil: true,
      province: { select: { name: true, code: true } },
      organisation: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageUsers(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const bodyResult = userCreateSchema.safeParse(parsed.data);
  if (!bodyResult.success) {
    return jsonError("Validation failed", 400, { issues: bodyResult.error.issues });
  }
  const body = bodyResult.data;

  if (body.role === "SUPER_ADMIN" && !isSuperAdmin(auth.user)) {
    return jsonError("Only super admins may create super admin accounts", 403);
  }

  let provinceId = body.provinceId ?? null;
  const organisationId = body.organisationId ?? null;
  if (!isSuperAdmin(auth.user)) {
    provinceId = auth.user.provinceId || null;
    if (!provinceId) return jsonError("Provincial admin missing province binding", 403);
  }

  if (body.role === "ORG_ADMIN" && !organisationId) {
    return jsonError("ORG_ADMIN accounts require an organisation", 400);
  }
  if (organisationId) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, provinceId: true },
    });
    if (!organisation) return jsonError("Organisation not found", 404);
    if (!isSuperAdmin(auth.user) && organisation.provinceId !== provinceId) {
      return jsonError("Organisation is outside your province scope", 403);
    }
    if (provinceId && organisation.provinceId && organisation.provinceId !== provinceId) {
      return jsonError("Organisation and province must match", 400);
    }
    if (!provinceId) provinceId = organisation.provinceId;
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash,
      role: body.role,
      provinceId,
      organisationId,
      mustChangePassword: true,
    },
  });
  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "CREATE_USER",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role, email: user.email },
    provinceId,
  });
  return jsonOk(
    { user: { id: user.id, email: user.email, role: user.role, mustChangePassword: true } },
    201
  );
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageUsers(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    id?: string;
    active?: boolean;
    role?: string;
    provinceId?: string | null;
    organisationId?: string | null;
    revokeSessions?: boolean;
    resetMfa?: boolean;
    currentPassword?: string;
  };
  if (!body.id) return jsonError("id required");

  const target = await prisma.user.findUnique({ where: { id: body.id } });
  if (!target) return jsonError("Not found", 404);
  if (!isSuperAdmin(auth.user) && target.provinceId !== auth.user.provinceId) {
    return jsonError("Outside your province scope", 403);
  }

  const data: Record<string, unknown> = {};
  const allowedRoles = ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"];
  if (body.role && !allowedRoles.includes(body.role)) return jsonError("Invalid role", 400);
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.role) {
    if (body.role === "SUPER_ADMIN" && !isSuperAdmin(auth.user)) {
      return jsonError("Cannot assign SUPER_ADMIN", 403);
    }
    data.role = body.role;
  }
  if (body.provinceId !== undefined && isSuperAdmin(auth.user)) {
    if (body.provinceId) {
      const province = await prisma.province.findUnique({ where: { id: body.provinceId }, select: { id: true } });
      if (!province) return jsonError("Province not found", 404);
    }
    data.provinceId = body.provinceId;
  }
  if (body.organisationId !== undefined) {
    if (body.organisationId) {
      const organisation = await prisma.organisation.findUnique({
        where: { id: body.organisationId },
        select: { id: true, provinceId: true },
      });
      if (!organisation) return jsonError("Organisation not found", 404);
      if (!isSuperAdmin(auth.user) && organisation.provinceId !== auth.user.provinceId) {
        return jsonError("Organisation is outside your province scope", 403);
      }
    }
    data.organisationId = body.organisationId;
  }
  const effectiveRole = body.role || target.role;
  const effectiveProvinceId = body.provinceId !== undefined ? body.provinceId : target.provinceId;
  const effectiveOrganisationId = body.organisationId !== undefined ? body.organisationId : target.organisationId;
  if (effectiveRole === "ORG_ADMIN" && !effectiveOrganisationId) {
    return jsonError("ORG_ADMIN accounts require an organisation", 400);
  }
  if (effectiveOrganisationId) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: effectiveOrganisationId },
      select: { provinceId: true },
    });
    if (!organisation) return jsonError("Organisation not found", 404);
    if (effectiveProvinceId && organisation.provinceId && organisation.provinceId !== effectiveProvinceId) {
      return jsonError("Organisation and province must match", 400);
    }
  }
  if (body.resetMfa) {
    if (!isSuperAdmin(auth.user)) return jsonError("Only a super administrator may reset MFA", 403);
    const actor = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!actor || !body.currentPassword || !(await bcrypt.compare(body.currentPassword, actor.passwordHash))) {
      return jsonError("Current administrator password is required to reset MFA", 400);
    }
    data.mfaEnabled = false;
    data.mfaSecret = null;
    data.mfaPendingSecret = null;
    data.mfaPendingKeyVersion = null;
    data.mfaRecoveryHashes = [];
    data.mustChangePassword = true;
  }

  // Always bump session version when privileges or tenant change
  const sensitive =
    body.active === false ||
    body.role ||
    body.provinceId !== undefined ||
    body.organisationId !== undefined ||
    body.revokeSessions ||
    body.resetMfa;
  if (sensitive) {
    data.sessionVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({ where: { id: body.id }, data });
  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: body.resetMfa ? "ADMIN_MFA_RESET" : "UPDATE_USER",
    entityType: "User",
    entityId: updated.id,
    metadata: {
      id: body.id,
      active: body.active,
      role: body.role,
      provinceId: body.provinceId,
      organisationId: body.organisationId,
      revokeSessions: body.revokeSessions,
      resetMfa: body.resetMfa,
    },
    provinceId: updated.provinceId,
    ipAddress: clientIp(req),
  });

  if (body.resetMfa) {
    await notify({
      type: "mfa.admin_reset",
      to: updated.email,
      userId: updated.id,
      subject: "MFA reset on your SA ICT Map account",
      body: "A super administrator reset MFA on your account. All sessions were revoked; sign in, change your password, and enroll MFA again.",
      meta: { actorId: auth.user.id },
    });
  }

  return jsonOk({
    user: {
      id: updated.id,
      active: updated.active,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
    },
  });
}
