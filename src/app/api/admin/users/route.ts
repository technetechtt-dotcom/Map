import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { writeAudit } from "@/lib/audit";
import { canManageUsers, isSuperAdmin } from "@/lib/policy";
import { userCreateSchema } from "@/lib/validation";
import { readJsonLimited } from "@/lib/security";
import { revokeUserSessions } from "@/lib/auth";

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
  };
  if (!body.id) return jsonError("id required");

  const target = await prisma.user.findUnique({ where: { id: body.id } });
  if (!target) return jsonError("Not found", 404);
  if (!isSuperAdmin(auth.user) && target.provinceId !== auth.user.provinceId) {
    return jsonError("Outside your province scope", 403);
  }

  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.role) {
    if (body.role === "SUPER_ADMIN" && !isSuperAdmin(auth.user)) {
      return jsonError("Cannot assign SUPER_ADMIN", 403);
    }
    data.role = body.role;
  }
  if (body.provinceId !== undefined && isSuperAdmin(auth.user)) {
    data.provinceId = body.provinceId;
  }
  if (body.organisationId !== undefined) data.organisationId = body.organisationId;

  // Always bump session version when privileges or tenant change
  const sensitive =
    body.active === false ||
    body.role ||
    body.provinceId !== undefined ||
    body.organisationId !== undefined ||
    body.revokeSessions;
  if (sensitive) {
    data.sessionVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({ where: { id: body.id }, data });
  if (body.revokeSessions || body.active === false) {
    await revokeUserSessions(body.id);
  }

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "UPDATE_USER",
    entityType: "User",
    entityId: updated.id,
    metadata: body,
    provinceId: updated.provinceId,
  });

  return jsonOk({
    user: {
      id: updated.id,
      active: updated.active,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
    },
  });
}
