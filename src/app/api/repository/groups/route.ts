import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canManageRepositoryGroups, isProvincialAdmin, isSuperAdmin } from "@/lib/policy";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const where = canManageRepositoryGroups(auth.user)
    ? isSuperAdmin(auth.user)
      ? { active: true }
      : { active: true, provinceId: auth.user.provinceId || "__none__" }
    : { active: true, members: { some: { userId: auth.user.id } } };

  const groups = await prisma.repositoryGroup.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { documentAccess: true } },
    },
  });
  return jsonOk({ groups });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageRepositoryGroups(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    name?: string;
    description?: string;
    provinceId?: string | null;
    organisationId?: string | null;
    memberEmails?: string[];
  };

  const name = String(body.name || "").trim();
  if (!name || name.length > 120) return jsonError("Group name is required", 400);

  let provinceId = body.provinceId || auth.user.provinceId || null;
  if (isProvincialAdmin(auth.user)) provinceId = auth.user.provinceId || null;
  if (isProvincialAdmin(auth.user) && !provinceId) return jsonError("Provincial admin has no province assignment", 403);

  const existingGroup = await prisma.repositoryGroup.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      provinceId,
      organisationId: body.organisationId || null,
      active: true,
    },
    select: { id: true },
  });
  if (existingGroup) return jsonError("A stakeholder group with this name already exists in this scope", 409);

  const emails = Array.from(new Set((body.memberEmails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
  const users = emails.length
    ? await prisma.user.findMany({
        where: {
          email: { in: emails },
          active: true,
          ...(isProvincialAdmin(auth.user) ? { provinceId } : {}),
        },
        select: { id: true, email: true },
      })
    : [];
  if (users.length !== emails.length) return jsonError("One or more member emails were not found in the permitted scope", 400);

  const group = await prisma.repositoryGroup.create({
      data: {
        name,
        description: body.description?.trim() || null,
        provinceId,
        organisationId: body.organisationId || null,
        createdById: auth.user.id,
        members: users.length ? { create: users.map((user) => ({ userId: user.id })) } : undefined,
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    await writeAudit({
      user: auth.user,
      action: "REPOSITORY_GROUP_CREATE",
      entityType: "RepositoryGroup",
      entityId: group.id,
      provinceId,
      organisationId: group.organisationId,
      metadata: { name, members: users.map((user) => user.email) },
    });
  return jsonOk({ group }, 201);
}
