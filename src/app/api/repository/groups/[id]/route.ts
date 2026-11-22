import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canManageRepositoryGroups, isProvincialAdmin, isSuperAdmin } from "@/lib/policy";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canManageRepositoryGroups(auth.user)) return jsonError("Forbidden", 403);
  const { id } = await params;

  const group = await prisma.repositoryGroup.findUnique({ where: { id } });
  if (!group) return jsonError("Not found", 404);
  if (isProvincialAdmin(auth.user) && group.provinceId !== auth.user.provinceId) {
    return jsonError("Outside your province scope", 403);
  }

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    name?: string;
    description?: string;
    active?: boolean;
    memberEmails?: string[];
  };

  const emails = body.memberEmails
    ? Array.from(new Set(body.memberEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean)))
    : null;
  let users: { id: string; email: string }[] | null = null;
  if (emails) {
    users = await prisma.user.findMany({
      where: {
        email: { in: emails },
        active: true,
        ...(isProvincialAdmin(auth.user) ? { provinceId: auth.user.provinceId || "__none__" } : {}),
      },
      select: { id: true, email: true },
    });
    if (users.length !== emails.length) return jsonError("One or more member emails were not found in the permitted scope", 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.repositoryGroup.update({
      where: { id },
      data: {
        name: body.name?.trim() || undefined,
        description: body.description === undefined ? undefined : body.description.trim() || null,
        active: typeof body.active === "boolean" ? body.active : undefined,
      },
    });
    if (users) {
      await tx.repositoryGroupMember.deleteMany({ where: { groupId: id } });
      if (users.length) {
        await tx.repositoryGroupMember.createMany({
          data: users.map((user) => ({ groupId: id, userId: user.id })),
        });
      }
    }
    return tx.repositoryGroup.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
  });

  await writeAudit({
    user: auth.user,
    action: "REPOSITORY_GROUP_UPDATE",
    entityType: "RepositoryGroup",
    entityId: id,
    provinceId: group.provinceId,
    organisationId: group.organisationId,
    metadata: {
      name: body.name,
      active: body.active,
      members: users?.map((user) => user.email),
    },
  });

  return jsonOk({ group: updated });
}
