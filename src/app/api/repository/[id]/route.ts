import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canManageRepositoryGroups, isOrgAdmin, isSuperAdmin, repositoryDocumentWhere } from "@/lib/policy";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;
  const document = await prisma.repositoryDocument.findFirst({
    where: { AND: [{ id }, repositoryDocumentWhere(auth.user)] },
    include: {
      storedObject: true,
      uploadedBy: { select: { id: true, name: true } },
      groupAccess: { include: { group: { select: { id: true, name: true } } } },
      supersedes: { select: { id: true, title: true, version: true } },
      supersededBy: { select: { id: true, title: true, version: true } },
    },
  });
  if (!document) return jsonError("Not found", 404);
  return jsonOk({ document });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const { id } = await params;
  const existing = await prisma.repositoryDocument.findUnique({
    where: { id },
    select: { id: true, uploadedById: true, organisationId: true, provinceId: true, status: true },
  });
  if (!existing) return jsonError("Not found", 404);
  const sameOrganisation = Boolean(existing.organisationId && existing.organisationId === auth.user.organisationId);
  const allowed =
    isSuperAdmin(auth.user) ||
    existing.uploadedById === auth.user.id ||
    (isOrgAdmin(auth.user) && sameOrganisation) ||
    (canManageRepositoryGroups(auth.user) && (!existing.provinceId || existing.provinceId === auth.user.provinceId));
  if (!allowed) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as { title?: string; description?: string; category?: string; status?: string };
  if (body.status && !["ACTIVE", "ARCHIVED"].includes(body.status)) return jsonError("Invalid status", 400);

  const document = await prisma.repositoryDocument.update({
    where: { id },
    data: {
      title: body.title?.trim() || undefined,
      description: body.description === undefined ? undefined : body.description.trim() || null,
      category: body.category === undefined ? undefined : body.category.trim() || null,
      status: body.status || undefined,
    },
  });
  await writeAudit({
    user: auth.user,
    action: "REPOSITORY_DOCUMENT_UPDATE",
    entityType: "RepositoryDocument",
    entityId: id,
    provinceId: existing.provinceId,
    organisationId: existing.organisationId,
    metadata: body,
  });
  return jsonOk({ document });
}
