import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") || "districts";
    const province = req.nextUrl.searchParams.get("province") || "northern-cape";

    if (type === "provinces") {
      const rows = await prisma.province.findMany({ orderBy: { name: "asc" } });
      const features = rows
        .map((p) => (p.geojson ? JSON.parse(p.geojson) : null))
        .filter(Boolean);
      return NextResponse.json({
        type: "FeatureCollection",
        features,
        meta: rows.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          slug: p.slug,
          centerLat: p.centerLat,
          centerLng: p.centerLng,
          defaultZoom: p.defaultZoom,
        })),
      });
    }

    const prov = await prisma.province.findFirst({
      where: { OR: [{ slug: province }, { code: province }, { name: province }] },
    });
    if (!prov) {
      return NextResponse.json({ type: "FeatureCollection", features: [] });
    }

    if (type === "municipalities") {
      const muns = await prisma.municipality.findMany({
        where: { district: { provinceId: prov.id } },
      });
      const features = muns
        .map((m) => {
          try {
            return m.geojson ? JSON.parse(m.geojson) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return NextResponse.json({ type: "FeatureCollection", features, count: muns.length });
    }

    const districts = await prisma.district.findMany({
      where: { provinceId: prov.id },
      include: { municipalities: true },
    });
    const features = districts
      .map((d) => {
        try {
          return d.geojson ? JSON.parse(d.geojson) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({
      type: "FeatureCollection",
      features,
      districts: districts.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        municipalities: d.municipalities.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
        })),
      })),
    });
  } catch (error) {
    console.error("[api/boundaries]", error);
    return NextResponse.json(
      {
        error: "Failed to load boundaries",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
