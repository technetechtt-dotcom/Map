import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hasMdbBoundaries,
  mdbDistrictFeatureCollection,
  mdbMunicipalityFeatureCollection,
} from "@/lib/mdb-boundaries";
import { withBoundaryFill } from "@/lib/boundary-colors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isNorthernCape(province: string) {
  const p = province.toLowerCase().replace(/\s+/g, "-");
  return (
    p === "northern-cape" ||
    p === "nc" ||
    p.includes("northern") ||
    province === "Northern Cape"
  );
}

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") || "districts";
    const province = req.nextUrl.searchParams.get("province") || "northern-cape";

    if (type === "provinces") {
      const rows = await prisma.province.findMany({ orderBy: { name: "asc" } });
      const features = rows
        .map((p) => (p.geojson ? p.geojson : null))
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

    // Live map uses the same MDB pack as the opportunity book (exact boundaries + colours).
    if (isNorthernCape(province) && hasMdbBoundaries()) {
      if (type === "municipalities") {
        const fc = mdbMunicipalityFeatureCollection();
        if (fc) {
          return NextResponse.json({
            ...fc,
            count: fc.features.length,
            source: "mdb-2018",
            attribution:
              "Municipal Demarcation Board (MDB) 2018 · colours match municipalities.co.za",
          });
        }
      } else {
        // districts (default)
        const fc = mdbDistrictFeatureCollection();
        if (fc) {
          return NextResponse.json({
            ...fc,
            source: "mdb-2018",
            attribution:
              "Municipal Demarcation Board (MDB) 2018 · colours match municipalities.co.za",
          });
        }
      }
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
        .map((m) => withBoundaryFill(m.geojson, m.code, m.name))
        .filter((feature): feature is GeoJSON.Feature => Boolean(feature));
      return NextResponse.json({ type: "FeatureCollection", features, count: muns.length });
    }

    const districts = await prisma.district.findMany({
      where: { provinceId: prov.id },
      include: { municipalities: true },
    });
    const features = districts
      .map((d) => withBoundaryFill(d.geojson, d.code, d.name))
      .filter((feature): feature is GeoJSON.Feature => Boolean(feature));

    return NextResponse.json({
      type: "FeatureCollection",
      features,
      districts: districts.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        fill: withBoundaryFill(d.geojson, d.code, d.name)?.properties?.fill,
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
