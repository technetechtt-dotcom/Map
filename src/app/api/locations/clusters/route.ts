import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimitAsync } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "clusters", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const bounds = (req.nextUrl.searchParams.get("bounds") || "").split(",").map(Number);
  const requestedZoom = Number(req.nextUrl.searchParams.get("zoom") || 6);
  const zoom = Number.isFinite(requestedZoom)
    ? Math.min(Math.max(Math.trunc(requestedZoom), 1), 20)
    : 6;
  if (bounds.length !== 4 || !bounds.every(Number.isFinite)) {
    return NextResponse.json({ error: "bounds=west,south,east,north required" }, { status: 400 });
  }
  const [west, south, east, north] = bounds;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    return NextResponse.json({ error: "Invalid geographic bounds" }, { status: 400 });
  }
  const cellSize = 360 / 2 ** zoom / 8;
  const clusters = await prisma.$queryRaw<
    { id: string; latitude: number; longitude: number; count: bigint }[]
  >`
    SELECT md5(ST_AsText(ST_SnapToGrid(geom, ${cellSize}))) AS id,
           ST_Y(ST_Centroid(ST_Collect(geom)))::float8 AS latitude,
           ST_X(ST_Centroid(ST_Collect(geom)))::float8 AS longitude,
           COUNT(*)::bigint AS count
    FROM "Location"
    WHERE status IN ('PUBLISHED', 'VERIFIED')
      AND geom && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
    GROUP BY ST_SnapToGrid(geom, ${cellSize})
    ORDER BY count DESC
    LIMIT 2000
  `;
  return NextResponse.json(
    { clusters: clusters.map((cluster) => ({ ...cluster, count: Number(cluster.count) })), zoom },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
