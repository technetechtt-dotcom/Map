import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { shapeLocation, serializeArray, PUBLIC_STATUSES } from "@/lib/shape";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  assertOrganisationAccess,
  assertProvinceAccess,
  assertStatusChange,
  canEditDrafts,
  canPublish,
  canVerify,
} from "@/lib/policy";
import { locationWriteSchema } from "@/lib/validation";
import { readJsonLimited } from "@/lib/security";
import { log } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const loc = await prisma.location.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
      sources: true,
    },
  });
  if (!loc) return jsonError("Not found", 404);

  // Public only sees public statuses; full detail when staff session
  if (!PUBLIC_STATUSES.includes(loc.status as (typeof PUBLIC_STATUSES)[number])) {
    const auth = await requireSession();
    if (auth.error) return jsonError("Not found", 404);
    const prov = assertProvinceAccess(auth.user, loc.provinceId);
    if (!prov.ok) return jsonError("Not found", 404);
  }

  return jsonOk({
    location: shapeLocation(loc),
    sources: loc.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      documentRef: s.documentRef,
      notes: s.notes,
      capturedAt: s.capturedAt,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const bodyResult = locationWriteSchema.safeParse(parsed.data);
  if (!bodyResult.success) {
    return jsonError("Validation failed", 400, { issues: bodyResult.error.issues });
  }
  const body = bodyResult.data;

  const existing = await prisma.location.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
  });
  if (!existing) return jsonError("Not found", 404);

  const prov = assertProvinceAccess(auth.user, existing.provinceId);
  if (!prov.ok) return jsonError(prov.reason, 403);
  const org = assertOrganisationAccess(auth.user, existing.organisationId);
  if (!org.ok) return jsonError(org.reason, 403);

  const statusCheck = assertStatusChange(auth.user, body.status, existing.status);
  if (!statusCheck.ok) return jsonError(statusCheck.reason, 403);

  // Org/contributor cannot reassign province outside scope
  if (body.provinceId) {
    const p2 = assertProvinceAccess(auth.user, body.provinceId);
    if (!p2.ok) return jsonError(p2.reason, 403);
  }
  if (body.organisationId) {
    const o2 = assertOrganisationAccess(auth.user, body.organisationId);
    if (!o2.ok) return jsonError(o2.reason, 403);
  }

  const data: Record<string, unknown> = {};
  const fields = [
    "name",
    "summary",
    "description",
    "latitude",
    "longitude",
    "website",
    "email",
    "phone",
    "address",
    "imageUrl",
    "verificationNotes",
    "verificationSource",
    "categoryId",
    "districtId",
    "municipalityId",
    "provinceId",
    "organisationId",
  ] as const;
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f] === "" ? null : body[f];
  }
  if (body.opportunities) data.opportunitiesJson = serializeArray(body.opportunities);
  if (body.assets) data.assetsJson = serializeArray(body.assets);
  if (body.tags) data.tagsJson = serializeArray(body.tags);
  if (body.coordQuality) data.coordQuality = body.coordQuality;
  if (body.coordSource !== undefined) data.coordSource = body.coordSource;
  if (body.verificationExpiresAt !== undefined) {
    data.verificationExpiresAt = body.verificationExpiresAt
      ? new Date(body.verificationExpiresAt)
      : null;
  }
  if (body.evidence) {
    data.evidenceJson = JSON.stringify(body.evidence);
  }

  if (body.status) {
    data.status = body.status;
    if (body.status === "VERIFIED" && canVerify(auth.user)) {
      data.lastVerifiedAt = new Date();
      data.reviewedById = auth.user.id;
    }
    if (body.status === "PUBLISHED" && canPublish(auth.user)) {
      data.lastVerifiedAt = data.lastVerifiedAt || new Date();
      data.reviewedById = auth.user.id;
      data.publishedAt = new Date();
    }
  }

  const updated = await prisma.location.update({
    where: { id: existing.id },
    data,
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
    },
  });

  await writeAudit({
    userId: auth.user.id,
    action: "UPDATE",
    entityType: "Location",
    entityId: updated.id,
    metadata: { fields: Object.keys(body) },
  });

  log.info("location.updated", { id: updated.id, by: auth.user.id });
  return jsonOk({ location: shapeLocation(updated) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canPublish(auth.user)) return jsonError("Forbidden", 403);

  const existing = await prisma.location.findFirst({
    where: { OR: [{ id: params.id }, { slug: params.id }] },
  });
  if (!existing) return jsonError("Not found", 404);

  const prov = assertProvinceAccess(auth.user, existing.provinceId);
  if (!prov.ok) return jsonError(prov.reason, 403);

  await prisma.location.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
  });
  await writeAudit({
    userId: auth.user.id,
    action: "ARCHIVE",
    entityType: "Location",
    entityId: existing.id,
  });
  return jsonOk({ ok: true });
}
