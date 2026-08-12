import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, shapeLocation } from "@/lib/shape";
import { trackEvent } from "@/lib/audit";
import { requireSession } from "@/lib/api";
import { tenantWhere } from "@/lib/policy";
import { rateLimitAsync } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const rl = await rateLimitAsync(`locations:${clientIp(req)}`, { limit: 120, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const province = sp.get("province") || "";
    const district = sp.get("district") || "";
    const category = sp.get("category") || "";
    const status = sp.get("status") || "";
    const verifiedOnly = sp.get("verified") === "1";
    const bounds = sp.get("bounds");
    const adminList = sp.get("scope") === "manage";
    const limit = Math.min(Math.max(Number(sp.get("limit") || 100), 1), 200);
    const cursor = sp.get("cursor") || undefined;
    const offset = Math.max(Number(sp.get("offset") || 0), 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (adminList) {
      const auth = await requireSession();
      if (auth.error) return auth.error;
      Object.assign(where, tenantWhere(auth.user));
      if (status) where.status = status;
    } else {
      where.status = { in: PUBLIC_STATUSES };
    }

    if (province) {
      where.province = { OR: [{ slug: province }, { code: province }, { name: province }] };
    }
    if (district) {
      where.district = { OR: [{ code: district }, { name: district }] };
    }
    if (category) {
      where.category = { OR: [{ slug: category }, { name: category }] };
    }
    if (verifiedOnly) where.lastVerifiedAt = { not: null };

    if (bounds) {
      const [west, south, east, north] = bounds.split(",").map(Number);
      if ([west, south, east, north].every((n) => Number.isFinite(n))) {
        where.longitude = { gte: west, lte: east };
        where.latitude = { gte: south, lte: north };
      }
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    const radiusKm = Number(sp.get("radiusKm") || 0);
    if (radiusKm > 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
      const radiusM = Math.min(Math.max(radiusKm, 0.1), 250) * 1000;
      try {
        const ids = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Location"
          WHERE geom IS NOT NULL
            AND ST_DWithin(
              geom::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${radiusM}
            )
          LIMIT ${limit}
        `;
        where.id = { in: ids.map((r) => r.id) };
      } catch {
        // PostGIS geom not available — fall back to bounding box approximation (~111km/deg)
        const d = radiusKm / 111;
        where.latitude = { gte: lat - d, lte: lat + d };
        where.longitude = { gte: lng - d, lte: lng + d };
      }
    }

    const total = await prisma.location.count({ where });

    const rows = await prisma.location.findMany({
      where,
      include: {
        category: true,
        province: true,
        district: true,
        municipality: true,
        organisation: true,
      },
      orderBy: { name: "asc" },
      take: limit,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : offset
          ? { skip: offset }
          : {}),
    });

    const shaped = rows.map(shapeLocation);
    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.id : null;

    trackEvent({
      eventType: "locations.search",
      path: "/api/locations",
      metadata: { q, province, district, category, count: shaped.length, adminList },
    }).catch(() => undefined);

    return NextResponse.json({
      count: shaped.length,
      total,
      limit,
      offset,
      nextCursor,
      locations: shaped,
    });
  } catch (error) {
    log.error("locations.list.failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 });
  }
}
