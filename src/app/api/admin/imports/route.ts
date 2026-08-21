import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { clientIp, readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { canManageAllProvinces, canPublish } from "@/lib/policy";
import { findDuplicateCandidates, findNearbyLocations } from "@/lib/duplicates";
import { pointInGeoJson } from "@/lib/geo-validation";
import { applyImportBatch } from "@/lib/import-apply";
import { parseLatitude, parseLongitude } from "@/lib/coords";

type ImportRow = {
  name?: string;
  summary?: string;
  description?: string;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
  website?: string;
  email?: string;
  phone?: string;
  categorySlug?: string;
  categoryId?: string;
  provinceSlug?: string;
  provinceId?: string;
  tags?: string[];
};

const MAX_ROWS = 500;

/** Stage bulk import rows with duplicate report. Apply creates DRAFT locations only. */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "import", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;
  if (!canPublish(auth.user) && !canManageAllProvinces(auth.user)) {
    return jsonError("Forbidden", 403);
  }

  const parsed = await readJsonLimited(req, 2_000_000);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = parsed.data as {
    source?: string;
    rows?: ImportRow[];
    apply?: boolean;
    batchId?: string;
    sourceUrl?: string;
    sourceVersion?: string;
    checksumSha256?: string;
    licence?: string;
  };

  if (body.apply && body.batchId) {
    if (!canManageAllProvinces(auth.user) && process.env.IMPORT_APPLY_PROVINCIAL !== "1") {
      return jsonError(
        "Only super admins can apply import batches unless IMPORT_APPLY_PROVINCIAL=1",
        403
      );
    }
    return applyBatch(body.batchId, auth.user, clientIp(req));
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) return jsonError(`rows required (max ${MAX_ROWS})`, 400);

  const provinces = await prisma.province.findMany({
    select: { id: true, slug: true, name: true, geojson: true },
  });
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  const provBySlug = new Map(provinces.map((p) => [p.slug, p]));
  const provById = new Map(provinces.map((p) => [p.id, p]));
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const defaultCategory = categories[0];

  const existingLocs = await prisma.location.findMany({
    select: {
      id: true,
      name: true,
      provinceId: true,
      latitude: true,
      longitude: true,
      slug: true,
      website: true,
      email: true,
      phone: true,
      address: true,
    },
  });

  const report: Array<{
    index: number;
    name: string;
    ok: boolean;
    issues: string[];
    duplicates: Array<{ id: string; name: string; score: number }>;
    nearby: Array<{ id: string; name: string; distanceM: number }>;
    provinceId: string | null;
  }> = [];

  const staged: ImportRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const issues: string[] = [];
    const name = String(row.name || "").trim();
    if (!name) issues.push("missing name");

    let provinceId: string | null = row.provinceId || null;
    if (row.provinceSlug) {
      const p = provBySlug.get(row.provinceSlug);
      if (p) provinceId = p.id;
      else issues.push("unknown provinceSlug");
    }
    if (provinceId && !provById.has(provinceId)) {
      issues.push("unknown provinceId");
      provinceId = null;
    }
    if (!canManageAllProvinces(auth.user)) {
      if (!auth.user.provinceId) issues.push("user has no province scope");
      else if (provinceId && provinceId !== auth.user.provinceId) {
        issues.push("row province outside user scope");
      } else if (!provinceId) {
        provinceId = auth.user.provinceId;
      }
    }

    let categoryId = row.categoryId || null;
    if (row.categorySlug) {
      const c = catBySlug.get(row.categorySlug);
      if (c) categoryId = c.id;
      else issues.push("unknown categorySlug");
    }
    if (!categoryId && defaultCategory) categoryId = defaultCategory.id;
    if (!categoryId) issues.push("no categories in database");

    const lat = parseLatitude(row.latitude);
    const lng = parseLongitude(row.longitude);
    if (lat == null || lng == null) issues.push("missing or out-of-range coordinates");
    if (lat != null && lng != null && provinceId) {
      const boundaryResult = pointInGeoJson(lng, lat, provById.get(provinceId)?.geojson);
      if (boundaryResult === false) issues.push("coordinates outside assigned province boundary");
    }

    const duplicates = name
      ? findDuplicateCandidates({ name, provinceId, website: row.website, email: row.email, phone: row.phone, address: row.address }, existingLocs, {
          threshold: 0.72,
          sameProvinceOnly: true,
        }).slice(0, 5)
      : [];
    const withCoords = existingLocs.filter(
      (l) => l.latitude != null && l.longitude != null
    ) as Array<{ id: string; name: string; latitude: number; longitude: number }>;
    const nearby =
      lat != null && lng != null
        ? findNearbyLocations(
            { latitude: lat, longitude: lng },
            withCoords,
            250
          ).slice(0, 5)
        : [];

    if (duplicates.some((d) => d.score >= 0.95)) issues.push("likely exact name duplicate");

    report.push({
      index: i,
      name,
      ok: issues.length === 0,
      issues,
      duplicates: duplicates.map((d) => ({ id: d.id, name: d.name, score: d.score })),
      nearby: nearby.map((n) => ({
        id: n.id,
        name: n.name,
        distanceM: Math.round(n.distanceM),
      })),
      provinceId,
    });
    staged.push({
      ...row,
      provinceId: provinceId || undefined,
      categoryId: categoryId || undefined,
      name,
    });
  }

  const okCount = report.filter((r) => r.ok).length;
  const calculatedChecksum = createHash("sha256").update(JSON.stringify(staged)).digest("hex");
  if (body.checksumSha256 && body.checksumSha256.toLowerCase() !== calculatedChecksum) {
    return jsonError("Dataset checksum does not match staged rows", 400);
  }
  const batch = await prisma.importBatch.create({
    data: {
      source: body.source || "manual",
      sourceUrl: body.sourceUrl,
      sourceVersion: body.sourceVersion,
      checksumSha256: body.checksumSha256 || calculatedChecksum,
      licence: body.licence,
      status: "STAGED",
      provinceId: canManageAllProvinces(auth.user) ? null : auth.user.provinceId,
      rowCount: staged.length,
      payloadJson: staged,
      reportJson: { okCount, total: staged.length, rows: report },
      createdById: auth.user.id,
    },
  });

  await writeAudit({
    user: auth.user,
    userId: auth.user.id,
    action: "IMPORT_STAGE",
    entityType: "ImportBatch",
    entityId: batch.id,
    provinceId: batch.provinceId,
    ipAddress: clientIp(req),
    metadata: { rowCount: staged.length, okCount },
  });

  return jsonOk({
    batchId: batch.id,
    okCount,
    total: staged.length,
    report: report.slice(0, 50),
    note: "Apply via POST { apply: true, batchId }. Creates DRAFT locations only.",
  });
}

async function applyBatch(
  batchId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  ipAddress?: string | null
) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return jsonError("Batch not found", 404);
  if (batch.status === "REJECTED") return jsonError("Batch already REJECTED", 400);
  if (
    !canManageAllProvinces(user) &&
    batch.provinceId &&
    user.provinceId &&
    batch.provinceId !== user.provinceId
  ) {
    return jsonError("Forbidden", 403);
  }

  const result = await applyImportBatch(batchId, {
    ownerId: user.id,
    forceProvinceId: canManageAllProvinces(user) ? null : user.provinceId || null,
  });

  await writeAudit({
    user,
    userId: user.id,
    action: "IMPORT_APPLY",
    entityType: "ImportBatch",
    entityId: batchId,
    provinceId: batch.provinceId,
    ipAddress,
    metadata: { applied: result.applied, errors: result.errors.length, idempotent: result.idempotent },
  });

  return jsonOk({ batchId, applied: result.applied, errors: result.errors.slice(0, 20), idempotent: result.idempotent });
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const batch = await prisma.importBatch.findUnique({ where: { id } });
    if (!batch) return jsonError("Not found", 404);
    if (
      !canManageAllProvinces(auth.user) &&
      batch.provinceId &&
      auth.user.provinceId !== batch.provinceId
    ) {
      return jsonError("Forbidden", 403);
    }
    return jsonOk({
      id: batch.id,
      source: batch.source,
      status: batch.status,
      provinceId: batch.provinceId,
      rowCount: batch.rowCount,
      appliedCount: batch.appliedCount,
      createdAt: batch.createdAt,
      appliedAt: batch.appliedAt,
      payloadHash: createHash("sha256")
        .update(JSON.stringify(batch.payloadJson))
        .digest("hex")
        .slice(0, 16),
      report: batch.reportJson,
    });
  }

  const where = canManageAllProvinces(auth.user)
    ? {}
    : { provinceId: auth.user.provinceId || "NONE" };
  const list = await prisma.importBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      source: true,
      status: true,
      provinceId: true,
      rowCount: true,
      appliedCount: true,
      createdAt: true,
      appliedAt: true,
    },
  });
  return jsonOk({ batches: list });
}
