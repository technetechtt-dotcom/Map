import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { writeAudit } from "@/lib/audit";
import { canManageUsers, isSuperAdmin } from "@/lib/policy";
import { userCreateSchema } from "@/lib/validation";
import { readJsonLimited } from "@/lib/security";

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
  let organisationId = body.organisationId ?? null;
  if (!isSuperAdmin(auth.user)) {
    provinceId = auth.user.provinceId || null;
    if (body.role === "PROVINCIAL_ADMIN" && provinceId !== auth.user.provinceId) {
      return jsonError("Cannot assign outside your province", 403);
    }
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
    },
  });
  await writeAudit({
    userId: auth.user.id,
    action: "CREATE_USER",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role, email: user.email },
  });
  return jsonOk({ user: { id: user.id, email: user.email, role: user.role } }, 201);
}
