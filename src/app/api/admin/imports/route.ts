import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimit } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { canManageAllProvinces, canPublish } from "@/lib/policy";
import { findDuplicateCandidates, findNearbyLocations } from "@/lib/duplicates";

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

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function parseCoord(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/** Stage bulk import rows with duplicate report. Apply creates DRAFT locations only. */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, "import", { limit: 10, windowMs: 60_000 });
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
  };

  if (body.apply && body.batchId) {
    if (!canManageAllProvinces(auth.user) && process.env.IMPORT_APPLY_PROVINCIAL !== "1") {
      return jsonError(
        "Only super admins can apply import batches unless IMPORT_APPLY_PROVINCIAL=1",
        403
      );
    }
    return applyBatch(body.batchId, auth.user);
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) return jsonError(`rows required (max ${MAX_ROWS})`, 400);

  const provinces = await prisma.province.findMany({
    select: { id: true, slug: true, name: true },
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

    const lat = parseCoord(row.latitude);
    const lng = parseCoord(row.longitude);
    if (lat == null || lng == null) issues.push("missing coordinates");
    else if (
      process.env.IMPORT_STRICT_SA_BOUNDS === "1" &&
      (lat < -35 || lat > -22 || lng < 16 || lng > 33)
    ) {
      issues.push("coordinates outside SA bounds");
    }

    const duplicates = name
      ? findDuplicateCandidates({ name, provinceId }, existingLocs, {
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
  const batch = await prisma.importBatch.create({
    data: {
      source: body.source || "manual",
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
  user: any
) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return jsonError("Batch not found", 404);
  if (batch.status !== "STAGED") return jsonError("Batch already " + batch.status, 400);
  if (
    !canManageAllProvinces(user) &&
    batch.provinceId &&
    user.provinceId &&
    batch.provinceId !== user.provinceId
  ) {
    return jsonError("Forbidden", 403);
  }

  const rows = Array.isArray(batch.payloadJson)
    ? (batch.payloadJson as ImportRow[])
    : [];

  const defaultCategory = await prisma.category.findFirst();
  let applied = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    const lat = parseCoord(row.latitude);
    const lng = parseCoord(row.longitude);
    if (lat == null || lng == null) {
      errors.push(`skip ${name}: no coords`);
      continue;
    }
    let provinceId = row.provinceId || batch.provinceId || null;
    if (!canManageAllProvinces(user) && user.provinceId) provinceId = user.provinceId;
    if (!provinceId) {
      errors.push(`skip ${name}: no province`);
      continue;
    }
    const categoryId = row.categoryId || defaultCategory?.id;
    if (!categoryId) {
      errors.push(`skip ${name}: no category`);
      continue;
    }

    const baseSlug = slugify(name) || "location";
    let slug = baseSlug;
    let n = 0;
    while (await prisma.location.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${baseSlug}-${n}`;
      if (n > 50) break;
    }

    try {
      await prisma.location.create({
        data: {
          name,
          slug,
          summary: String(row.summary || name).slice(0, 500),
          description: row.description ? String(row.description).slice(0, 4000) : null,
          latitude: lat,
          longitude: lng,
          address: row.address ? String(row.address).slice(0, 500) : null,
          website: row.website ? String(row.website).slice(0, 500) : null,
          email: row.email ? String(row.email).slice(0, 200) : null,
          phone: row.phone ? String(row.phone).slice(0, 80) : null,
          tagsJson: Array.isArray(row.tags) ? row.tags.slice(0, 20) : [],
          provinceId,
          categoryId,
          status: "DRAFT",
          verificationNotes: `Imported via batch ${batchId}`,
          coordQuality: "unknown",
          coordSource: batch.source,
          ownerId: user.id,
        },
      });
      applied += 1;
    } catch (e) {
      errors.push(`fail ${name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  const priorReport =
    batch.reportJson && typeof batch.reportJson === "object"
      ? (batch.reportJson as Record<string, unknown>)
      : {};

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: "APPLIED",
      appliedCount: applied,
      appliedAt: new Date(),
      reportJson: {
        ...priorReport,
        applyErrors: errors.slice(0, 100),
        applied,
      },
    },
  });

  await writeAudit({
    user,
    userId: user.id,
    action: "IMPORT_APPLY",
    entityType: "ImportBatch",
    entityId: batchId,
    metadata: { applied, errors: errors.length },
  });

  return jsonOk({ batchId, applied, errors: errors.slice(0, 20) });
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
