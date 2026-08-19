import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, shapeLocation } from "@/lib/shape";
import { trackEvent } from "@/lib/audit";
import { requireSession } from "@/lib/api";
import { tenantWhere } from "@/lib/policy";
import { rateLimitAsync } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const rl = await rateLimitAsync(`locations:${clientIdentity(req)}`, { limit: 120, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q")?.trim() || "").slice(0, 100);
    const province = sp.get("province") || "";
    const district = sp.get("district") || "";
    const category = sp.get("category") || "";
    const status = sp.get("status") || "";
    const verifiedOnly = sp.get("verified") === "1";
    const bounds = sp.get("bounds");
    const adminList = sp.get("scope") === "manage";
    const requestedLimit = Number(sp.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      : 100;
    const cursor = sp.get("cursor") || undefined;
    const requestedOffset = Number(sp.get("offset") || 0);
    const offset = Number.isFinite(requestedOffset)
      ? Math.min(Math.max(Math.trunc(requestedOffset), 0), 10_000)
      : 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    let candidateIds: string[] | null = null;
    const searchRanks = new Map<string, number>();
    const distances = new Map<string, number>();
    let searchMode: "none" | "postgres-fts" | "contains-fallback" = "none";
    let spatialMode: "none" | "postgis" | "bounding-box-fallback" = "none";
    const intersectCandidates = (ids: string[]) => {
      const allowed = new Set(ids);
      candidateIds = candidateIds == null ? ids : candidateIds.filter((id) => allowed.has(id));
    };

    if (adminList) {
      const auth = await requireSession();
      if (auth.error) return auth.error;
      Object.assign(where, tenantWhere(auth.user));
      if (status) where.status = status;
    } else {
      where.status = { in: PUBLIC_STATUSES };
    }

    if (province) where.province = { OR: [{ slug: province }, { code: province }, { name: province }] };
    if (district) where.district = { OR: [{ code: district }, { name: district }] };
    if (category) where.category = { OR: [{ slug: category }, { name: category }] };
    if (verifiedOnly) where.lastVerifiedAt = { not: null };

    if (bounds) {
      const [west, south, east, north] = bounds.split(",").map(Number);
      if (
        ![west, south, east, north].every(Number.isFinite) ||
        west < -180 || east > 180 || south < -90 || north > 90 ||
        west > east || south > north
      ) {
        return NextResponse.json({ error: "Invalid geographic bounds" }, { status: 400 });
      }
      where.longitude = { gte: west, lte: east };
      where.latitude = { gte: south, lte: north };
    }

    if (q) {
      try {
        const hits = await prisma.$queryRaw<{ id: string; rank: number }[]>`
          SELECT id,
            (ts_rank_cd(
              to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '')),
              websearch_to_tsquery('simple', ${q})
            ) + similarity(name, ${q}))::float8 AS rank
          FROM "Location"
          WHERE to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, ''))
                  @@ websearch_to_tsquery('simple', ${q})
             OR name % ${q}
             OR similarity(name, ${q}) > 0.15
          ORDER BY rank DESC, name ASC
          LIMIT 1000
        `;
        hits.forEach((hit) => searchRanks.set(hit.id, Number(hit.rank)));
        intersectCandidates(hits.map((hit) => hit.id));
        searchMode = "postgres-fts";
      } catch (error) {
        searchMode = "contains-fallback";
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ];
        log.warn("locations.search.fts_fallback", {
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    const radiusRaw = sp.get("radiusKm");
    const radiusKm = Number(radiusRaw || 0);
    if (radiusRaw && (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 250)) {
      return NextResponse.json({ error: "radiusKm must be between 0 and 250" }, { status: 400 });
    }
    if (
      radiusKm > 0 &&
      (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
    ) {
      return NextResponse.json({ error: "Valid lat/lng are required for radius search" }, { status: 400 });
    }
    if (radiusKm > 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
      const radiusM = Math.min(Math.max(radiusKm, 0.1), 250) * 1000;
      try {
        const hits = await prisma.$queryRaw<{ id: string; distance: number }[]>`
          SELECT id, ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          )::float8 AS distance
          FROM "Location"
          WHERE geom IS NOT NULL
            AND ST_DWithin(
              geom::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${radiusM}
            )
          ORDER BY distance ASC
          LIMIT 1000
        `;
        hits.forEach((hit) => distances.set(hit.id, Number(hit.distance)));
        intersectCandidates(hits.map((hit) => hit.id));
        spatialMode = "postgis";
      } catch (error) {
        spatialMode = "bounding-box-fallback";
        const d = radiusKm / 111;
        where.latitude = { gte: lat - d, lte: lat + d };
        where.longitude = { gte: lng - d, lte: lng + d };
        log.error("locations.radius.postgis_fallback", {
          detail: error instanceof Error ? error.message : String(error),
          radiusKm,
        });
        trackEvent({ eventType: "spatial.fallback", path: "/api/locations", metadata: { radiusKm } }).catch(() => undefined);
      }
    }

    if (candidateIds) where.id = { in: candidateIds };
    const total = await prisma.location.count({ where });
    const ranked = searchMode === "postgres-fts" || spatialMode === "postgis";
    const rows = await prisma.location.findMany({
      where,
      include: { category: true, province: true, district: true, municipality: true, organisation: true },
      orderBy: { name: "asc" },
      take: ranked ? 1000 : limit,
      ...(!ranked && cursor
        ? { skip: 1, cursor: { id: cursor } }
        : !ranked && offset
          ? { skip: offset }
          : {}),
    });

    if (spatialMode === "postgis") {
      rows.sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
    } else if (searchMode === "postgres-fts") {
      rows.sort((a, b) => (searchRanks.get(b.id) ?? 0) - (searchRanks.get(a.id) ?? 0));
    }
    const pageRows = rows.slice(ranked ? offset : 0, (ranked ? offset : 0) + limit);
    const shaped = pageRows.map((row) =>
      shapeLocation(row, distances.has(row.id) ? distances.get(row.id)! / 1000 : undefined)
    );
    const nextCursor = !ranked && pageRows.length === limit ? pageRows[pageRows.length - 1]?.id : null;

    trackEvent({
      eventType: "locations.search",
      path: "/api/locations",
      metadata: { q, province, district, category, count: shaped.length, adminList, searchMode, spatialMode },
    }).catch(() => undefined);

    return NextResponse.json({
      count: shaped.length,
      total,
      limit,
      offset,
      nextCursor,
      query: { searchMode, spatialMode },
      locations: shaped,
    });
  } catch (error) {
    log.error("locations.list.failed", { detail: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 });
  }
}
