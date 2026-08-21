import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimitAsync } from "@/lib/api";
import { parseNearbyQuery } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "nearby", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = parseNearbyQuery({
    lat: req.nextUrl.searchParams.get("lat"),
    lng: req.nextUrl.searchParams.get("lng"),
    radiusKm: req.nextUrl.searchParams.get("radiusKm"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { lat, lng, radiusKm } = parsed;
  const kind = req.nextUrl.searchParams.get("kind") || "organisation";
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
    return NextResponse.json({ results: rows, radiusKm });
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
