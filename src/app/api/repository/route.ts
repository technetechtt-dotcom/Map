import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import {
  canManageRepositoryGroups,
  isOrgAdmin,
  isProvincialAdmin,
  isSuperAdmin,
  repositoryDocumentWhere,
} from "@/lib/policy";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

const VISIBILITY = new Set(["GROUPS", "ORGANISATION", "PROVINCE", "ALL_STAKEHOLDERS"]);

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const category = (req.nextUrl.searchParams.get("category") || "").trim();
  const clauses: Record<string, unknown>[] = [
    repositoryDocumentWhere(auth.user),
    { status: "ACTIVE" },
  ];
  if (q) {
    clauses.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (category) clauses.push({ category });

  const documents = await prisma.repositoryDocument.findMany({
    where: { AND: clauses },
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      storedObject: {
        select: { id: true, url: true, filename: true, contentType: true, sizeBytes: true, sha256: true },
      },
      uploadedBy: { select: { id: true, name: true } },
      groupAccess: { include: { group: { select: { id: true, name: true } } } },
    },
  });

  return jsonOk({
    documents: documents.map((document) => ({
      ...document,
      groups: document.groupAccess.map((entry) => entry.group),
      groupAccess: undefined,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    storedObjectId?: string;
    title?: string;
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: string;
    groupIds?: string[];
    provinceId?: string | null;
    organisationId?: string | null;
    supersedesId?: string | null;
  };

  const title = String(body.title || "").trim();
  const storedObjectId = String(body.storedObjectId || "").trim();
  const visibility = String(body.visibility || "GROUPS").toUpperCase();
  const groupIds = Array.from(new Set((body.groupIds || []).filter(Boolean)));

  if (!title || title.length > 180) return jsonError("Title is required and must be 180 characters or less", 400);
  if (!storedObjectId) return jsonError("storedObjectId required", 400);
  if (!VISIBILITY.has(visibility)) return jsonError("Invalid visibility", 400);
  if (visibility === "GROUPS" && groupIds.length === 0) {
    return jsonError("Select at least one stakeholder group", 400);
  }
  if ((visibility === "PROVINCE" || visibility === "ALL_STAKEHOLDERS") && !canManageRepositoryGroups(auth.user)) {
    return jsonError("Only provincial or super administrators may use this visibility", 403);
  }

  const object = await prisma.storedObject.findUnique({
    where: { id: storedObjectId },
    select: { id: true, access: true, uploadedById: true, organisationId: true },
  });
  if (!object) return jsonError("Uploaded object not found", 404);
  if (object.access !== "private") return jsonError("Repository documents must use private storage", 400);
  if (!isSuperAdmin(auth.user) && object.uploadedById !== auth.user.id) {
    return jsonError("You may only register files you uploaded", 403);
  }
  const alreadyRegistered = await prisma.repositoryDocument.findUnique({ where: { storedObjectId } });
  if (alreadyRegistered) return jsonError("This upload is already registered in the repository", 409);

  let provinceId = auth.user.provinceId || null;
  let organisationId = auth.user.organisationId || object.organisationId || null;
  if (isSuperAdmin(auth.user)) {
    provinceId = body.provinceId || null;
    organisationId = body.organisationId || object.organisationId || null;
  }
  if (visibility === "ORGANISATION" && !organisationId) {
    return jsonError("Organisation visibility requires an organisation assignment", 400);
  }

  if (groupIds.length) {
    const groups = await prisma.repositoryGroup.findMany({
      where: { id: { in: groupIds }, active: true },
      include: { members: { where: { userId: auth.user.id }, select: { id: true } } },
    });
    if (groups.length !== groupIds.length) return jsonError("One or more stakeholder groups do not exist", 400);
    for (const group of groups) {
      if (isProvincialAdmin(auth.user) && group.provinceId && group.provinceId !== auth.user.provinceId) {
        return jsonError("Stakeholder group is outside your province", 403);
      }
      if (!canManageRepositoryGroups(auth.user) && group.members.length === 0) {
        return jsonError("You may only share to groups you belong to", 403);
      }
    }
  }

  let version = 1;
  if (body.supersedesId) {
    const previous = await prisma.repositoryDocument.findUnique({
      where: { id: body.supersedesId },
      select: { id: true, version: true, uploadedById: true, organisationId: true },
    });
    if (!previous) return jsonError("Previous document version not found", 404);
    const sameOrganisation = Boolean(previous.organisationId && previous.organisationId === auth.user.organisationId);
    if (!isSuperAdmin(auth.user) && previous.uploadedById !== auth.user.id && !(isOrgAdmin(auth.user) && sameOrganisation)) {
      return jsonError("Not allowed to version this document", 403);
    }
    version = previous.version + 1;
  }

  const document = await prisma.repositoryDocument.create({
    data: {
      title,
      description: body.description?.trim() || null,
      category: body.category?.trim() || null,
      tagsJson: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      visibility,
      storedObjectId,
      uploadedById: auth.user.id,
      provinceId,
      organisationId,
      supersedesId: body.supersedesId || null,
      version,
      groupAccess: groupIds.length
        ? { create: groupIds.map((groupId) => ({ groupId })) }
        : undefined,
    },
    include: { storedObject: true, groupAccess: { include: { group: true } } },
  });

  if (body.supersedesId) {
    await prisma.repositoryDocument.update({
      where: { id: body.supersedesId },
      data: { status: "SUPERSEDED" },
    });
  }

  await writeAudit({
    user: auth.user,
    action: "REPOSITORY_DOCUMENT_CREATE",
    entityType: "RepositoryDocument",
    entityId: document.id,
    provinceId,
    organisationId,
    metadata: { title, visibility, version, groups: groupIds, sha256: document.storedObject.sha256 },
  });

  return jsonOk({ document }, 201);
}
