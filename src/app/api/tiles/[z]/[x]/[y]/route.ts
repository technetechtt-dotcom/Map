import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: { z: string; x: string; y: string } }) {
  const z = Number(context.params.z);
  const x = Number(context.params.x);
  const y = Number(context.params.y);
  const max = 2 ** z;
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 18 || x < 0 || y < 0 || x >= max || y >= max) {
    return NextResponse.json({ error: "Invalid tile" }, { status: 400 });
  }
  const rows = await prisma.$queryRaw<{ tile: Buffer }[]>`
    WITH bounds AS (SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS geom),
    features AS (
      SELECT id, slug, name, "categoryId", "provinceId",
             ST_AsMVTGeom(ST_Transform(l.geom, 3857), bounds.geom, 4096, 64, true) AS geom
      FROM "Location" l, bounds
      WHERE l.status IN ('PUBLISHED', 'VERIFIED')
        AND ST_Intersects(ST_Transform(l.geom, 3857), bounds.geom)
      LIMIT 10000
    )
    SELECT ST_AsMVT(features, 'locations', 4096, 'geom') AS tile FROM features
  `;
  // Convert Node's Buffer to a standards-compatible BodyInit for NextResponse.
  // (Buffer's generic ArrayBufferLike type is not assignable on newer TypeScript DOM libs.)
  const tile = rows[0]?.tile ? new Uint8Array(rows[0].tile) : new Uint8Array();
  return new NextResponse(tile, {
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Encoding": "identity",
    },
  });
}
