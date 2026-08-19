import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimitAsync } from "@/lib/api";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "nearby", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const radiusKm = Math.min(Math.max(Number(req.nextUrl.searchParams.get("radiusKm") || 25), 1), 150);
  const kind = req.nextUrl.searchParams.get("kind") || "organisation";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  const metres = radiusKm * 1000;
  if (kind === "location") {
    const rows = await prisma.$queryRaw<Array<{ id: string; slug: string; name: string; type: string; metres: number }>>`
      SELECT id, slug, name, 'location' AS type,
             ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::float8 AS metres
      FROM "Location"
      WHERE status IN ('PUBLISHED','VERIFIED')
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${metres})
      ORDER BY metres ASC
      LIMIT 25
    `;
    return NextResponse.json({ results: rows });
  }
  const rows = await prisma.$queryRaw<Array<{ id: string; slug: string; name: string; type: string; metres: number }>>`
    SELECT id, slug, name, type,
           ST_Distance(
             ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
             ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
           )::float8 AS metres
    FROM "Organisation"
    WHERE status = 'PUBLISHED' AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${metres}
      )
    ORDER BY metres ASC
    LIMIT 25
  `;
  return NextResponse.json({ results: rows, radiusKm });
}
