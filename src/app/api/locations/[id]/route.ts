import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { shapeLocation, serializeArray, PUBLIC_STATUSES } from "@/lib/shape";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  assertLocationAccess,
  assertLocationAssignmentChange,
  assertPublishableQuality,
  assertStatusChange,
  canEditDrafts,
  canPublish,
  canVerify,
} from "@/lib/policy";
import { locationWriteSchema } from "@/lib/validation";
import { clientIp, readJsonLimited } from "@/lib/security";
import { pointInGeoJson, validatePointAssignment } from "@/lib/geo-validation";
import { log } from "@/lib/logger";
import { verificationActionData } from "@/lib/verification";
import { invalidatePublicCaches } from "@/lib/server-memo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const loc = await prisma.location.findFirst({
    where: { OR: [{ id }, { slug: id }] },
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

  const isPublic = PUBLIC_STATUSES.includes(
    loc.status as (typeof PUBLIC_STATUSES)[number]
  );

  if (!isPublic) {
    const auth = await requireSession();
    if (auth.error) return jsonError("Not found", 404);
    const access = assertLocationAccess(auth.user, loc, "read");
    if (!access.ok) return jsonError("Not found", 404);
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

  // Public profile: no draft verification notes / raw source internals
  return jsonOk({
    location: shapeLocation(loc),
    sources: loc.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      documentRef: s.documentRef,
      capturedAt: s.capturedAt,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!existing) return jsonError("Not found", 404);

  const access = assertLocationAccess(auth.user, existing, "write");
  if (!access.ok) return jsonError(access.reason, 403);

  const assign = assertLocationAssignmentChange(
    auth.user,
    existing,
    body.organisationId,
    body.provinceId
  );
  if (!assign.ok) return jsonError(assign.reason, 403);

  if (body.organisationId) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: body.organisationId },
      select: { id: true, provinceId: true },
    });
    if (!organisation) return jsonError("Organisation not found", 404);
    const nextProvinceId = body.provinceId ?? existing.provinceId;
    if (organisation.provinceId && organisation.provinceId !== nextProvinceId) {
      return jsonError("Organisation and location must belong to the same province", 400);
    }
  }

  const nextProvinceId = body.provinceId ?? existing.provinceId;
  let districtGeojson: unknown = null;
  let municipalityGeojson: unknown = null;
  if (body.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } });
    if (!category) return jsonError("Category not found", 404);
  }
  if (body.districtId) {
    const district = await prisma.district.findFirst({ where: { id: body.districtId, provinceId: nextProvinceId }, select: { id: true, geojson: true } });
    if (!district) return jsonError("District is outside the selected province", 400);
    districtGeojson = district.geojson;
  }
  if (body.municipalityId) {
    const municipality = await prisma.municipality.findFirst({ where: { id: body.municipalityId, district: { provinceId: nextProvinceId } }, select: { id: true, geojson: true } });
    if (!municipality) return jsonError("Municipality is outside the selected province", 400);
    municipalityGeojson = municipality.geojson;
  }
  if (body.latitude !== undefined || body.longitude !== undefined || body.provinceId !== undefined) {
    const province = await prisma.province.findUnique({ where: { id: nextProvinceId }, select: { geojson: true } });
    if (!province) return jsonError("Province not found", 404);
    const assignment = validatePointAssignment(
      body.longitude ?? existing.longitude,
      body.latitude ?? existing.latitude,
      province.geojson
    );
    if (assignment === "invalid" && process.env.ENFORCE_GEO_BOUNDARIES === "1") {
      return jsonError("Coordinates are outside the selected province boundary", 400);
    }
    if (process.env.ENFORCE_GEO_BOUNDARIES === "1" && districtGeojson && !pointInGeoJson(body.longitude ?? existing.longitude, body.latitude ?? existing.latitude, districtGeojson)) {
      return jsonError("Coordinates are outside the selected district boundary", 400);
    }
    if (process.env.ENFORCE_GEO_BOUNDARIES === "1" && municipalityGeojson && !pointInGeoJson(body.longitude ?? existing.longitude, body.latitude ?? existing.latitude, municipalityGeojson)) {
      return jsonError("Coordinates are outside the selected municipality boundary", 400);
    }
  }

  const statusCheck = assertStatusChange(auth.user, body.status, existing.status);
  if (!statusCheck.ok) return jsonError(statusCheck.reason, 403);

  if (body.status === "PUBLISHED") {
    const quality = assertPublishableQuality(body.coordQuality || existing.coordQuality);
    if (!quality.ok) return jsonError(quality.reason, 400);
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
  if (body.verificationTier === "desktop" || body.verificationTier === "field" || body.verificationTier === "directory" || body.verificationTier === "unverified") {
    data.verificationTier = body.verificationTier;
  }
  if (body.evidence) {
    data.evidenceJson = body.evidence;
  }

  if (body.status) {
    data.status = body.status;
    const stamp = verificationActionData({
      status: body.status,
      requestedTier: typeof body.verificationTier === "string" ? body.verificationTier : null,
      existingTier: existing.verificationTier,
      source: typeof body.verificationSource === "string" ? body.verificationSource : existing.verificationSource,
    });
    if (body.status === "VERIFIED" && canVerify(auth.user)) {
      Object.assign(data, stamp);
      data.reviewedById = auth.user.id;
    }
    if (body.status === "PUBLISHED" && canPublish(auth.user)) {
      Object.assign(data, stamp);
      data.reviewedById = auth.user.id;
      data.publishedAt = new Date();
    }
  }
  if (body.verificationExpiresAt) {
    data.verificationExpiresAt = new Date(body.verificationExpiresAt);
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
    user: auth.user,
    userId: auth.user.id,
    action: "UPDATE",
    entityType: "Location",
    entityId: updated.id,
    metadata: { fields: Object.keys(body) },
    provinceId: updated.provinceId,
    organisationId: updated.organisationId,
    ipAddress: clientIp(req),
  });

  log.info("location.updated", { id: updated.id, by: auth.user.id });
  invalidatePublicCaches(["locations-public", "orgs-public"]);
  return jsonOk({ location: shapeLocation(updated) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canPublish(auth.user)) return jsonError("Forbidden", 403);

  const existing = await prisma.location.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!existing) return jsonError("Not found", 404);

  const access = assertLocationAccess(auth.user, existing, "write");
  if (!access.ok) return jsonError(access.reason, 403);

  await prisma.location.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
  });
  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "ARCHIVE",
    entityType: "Location",
    entityId: existing.id,
    provinceId: existing.provinceId,
    organisationId: existing.organisationId,
    ipAddress: clientIp(_req),
  });
  invalidatePublicCaches(["locations-public"]);
  return jsonOk({ ok: true });
}
