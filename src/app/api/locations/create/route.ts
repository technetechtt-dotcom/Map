import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { serializeArray, shapeLocation } from "@/lib/shape";
import { writeAudit } from "@/lib/audit";
import {
  assertOrganisationAccess,
  assertProvinceAccess,
  canEditDrafts,
  coerceCreateStatus,
} from "@/lib/policy";
import { locationCreateSchema } from "@/lib/validation";
import { clientIp, readJsonLimited } from "@/lib/security";
import { pointInGeoJson, validatePointAssignment } from "@/lib/geo-validation";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "loc-create", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canEditDrafts(auth.user)) return jsonError("Forbidden", 403);

  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const bodyResult = locationCreateSchema.safeParse(parsed.data);
  if (!bodyResult.success) {
    return jsonError("Validation failed", 400, { issues: bodyResult.error.issues });
  }
  const body = bodyResult.data;

  let categoryId = (parsed.data as { categoryId?: string }).categoryId;
  if (!categoryId && body.categorySlug) {
    const cat = await prisma.category.findUnique({ where: { slug: body.categorySlug } });
    categoryId = cat?.id;
  }
  if (!categoryId) {
    const first = await prisma.category.findFirst();
    categoryId = first?.id;
  }
  if (!categoryId) return jsonError("No category configured", 500);
  if (!(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
    return jsonError("Category not found", 404);
  }

  let provinceId = body.provinceId || auth.user.provinceId || undefined;
  if (!provinceId && body.provinceSlug) {
    const p = await prisma.province.findFirst({
      where: { OR: [{ slug: body.provinceSlug }, { code: body.provinceSlug }] },
    });
    provinceId = p?.id;
  }
  // Non-super may not inherit a default province from "first NC" without having one assigned
  if (!provinceId) {
    if (auth.user.role === "SUPER_ADMIN") {
      const nc = await prisma.province.findFirst({ where: { code: "NC" } });
      provinceId = nc?.id;
    } else {
      return jsonError("Province required for your account", 400);
    }
  }
  if (!provinceId) return jsonError("Province required", 400);

  const province = await prisma.province.findUnique({
    where: { id: provinceId },
    select: { id: true, geojson: true },
  });
  if (!province) return jsonError("Province not found", 404);
  let districtGeojson: unknown = null;
  let municipalityGeojson: unknown = null;
  if (body.districtId) {
    const district = await prisma.district.findFirst({
      where: { id: body.districtId, provinceId },
      select: { id: true, geojson: true },
    });
    if (!district) return jsonError("District is outside the selected province", 400);
    districtGeojson = district.geojson;
  }
  if (body.municipalityId) {
    const municipality = await prisma.municipality.findFirst({
      where: { id: body.municipalityId, district: { provinceId } },
      select: { id: true, geojson: true },
    });
    if (!municipality) return jsonError("Municipality is outside the selected province", 400);
    municipalityGeojson = municipality.geojson;
  }
  const assignment = validatePointAssignment(Number(body.longitude), Number(body.latitude), province.geojson);
  if (assignment === "invalid" && process.env.ENFORCE_GEO_BOUNDARIES === "1") {
    return jsonError("Coordinates are outside the selected province boundary", 400);
  }
  if (process.env.ENFORCE_GEO_BOUNDARIES === "1" && districtGeojson && !pointInGeoJson(Number(body.longitude), Number(body.latitude), districtGeojson)) {
    return jsonError("Coordinates are outside the selected district boundary", 400);
  }
  if (process.env.ENFORCE_GEO_BOUNDARIES === "1" && municipalityGeojson && !pointInGeoJson(Number(body.longitude), Number(body.latitude), municipalityGeojson)) {
    return jsonError("Coordinates are outside the selected municipality boundary", 400);
  }

  const prov = assertProvinceAccess(auth.user, provinceId);
  if (!prov.ok) return jsonError(prov.reason, 403);

  // Org admin creates under their org only
  let organisationId = body.organisationId || auth.user.organisationId || null;
  if (auth.user.role === "ORG_ADMIN") {
    if (!auth.user.organisationId) return jsonError("Org admin has no organisation", 403);
    organisationId = auth.user.organisationId;
  }
  if (organisationId) {
    const org = assertOrganisationAccess(auth.user, organisationId);
    if (!org.ok) return jsonError(org.reason, 403);
    const organisation = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, provinceId: true },
    });
    if (!organisation) return jsonError("Organisation not found", 404);
    if (organisation.provinceId && organisation.provinceId !== provinceId) {
      return jsonError("Organisation and location must belong to the same province", 400);
    }
  }
  if (auth.user.role === "ORG_ADMIN" && !organisationId) {
    return jsonError("Organisation assignment required", 403);
  }

  const status = coerceCreateStatus(auth.user, body.status);

  const baseSlug = body.slug || slugify(body.name);
  let slug = baseSlug;
  let i = 1;
  while (await prisma.location.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${i++}`;
  }

  const created = await prisma.location.create({
    data: {
      slug,
      name: body.name,
      summary: body.summary,
      description: body.description || null,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      categoryId,
      provinceId,
      districtId: body.districtId || null,
      municipalityId: body.municipalityId || null,
      opportunitiesJson: serializeArray(body.opportunities || []),
      assetsJson: serializeArray(body.assets || []),
      tagsJson: serializeArray(body.tags || []),
      website: body.website || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      imageUrl: body.imageUrl || null,
      status,
      ownerId: auth.user.id,
      organisationId,
      verificationSource: body.verificationSource || null,
      coordQuality: body.coordQuality || "unknown",
      coordSource: body.coordSource || null,
    },
    include: {
      category: true,
      province: true,
      district: true,
      municipality: true,
      organisation: true,
    },
  });

  if (body.sourceTitle) {
    await prisma.sourceRecord.create({
      data: {
        locationId: created.id,
        title: body.sourceTitle,
        url: body.sourceUrl || null,
        documentRef: body.documentRef || null,
        notes: body.sourceNotes || null,
        capturedById: auth.user.id,
      },
    });
  }

  await writeAudit({
    userId: auth.user.id,
    action: "CREATE",
    entityType: "Location",
    entityId: created.id,
    metadata: { name: created.name, status },
    provinceId: created.provinceId,
    organisationId: created.organisationId,
    ipAddress: clientIp(req),
  });

  return jsonOk({ location: shapeLocation(created) }, 201);
}
