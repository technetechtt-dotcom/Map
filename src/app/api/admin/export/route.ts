import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canAccessOpsDashboard } from "@/lib/policy";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canAccessOpsDashboard(auth.user)) return jsonError("Forbidden", 403);

  const entity = req.nextUrl.searchParams.get("entity") || "locations";
  const format = req.nextUrl.searchParams.get("format") || "json";
  const province = req.nextUrl.searchParams.get("province") || "";

  const provinceFilter = province
    ? { province: { OR: [{ slug: province }, { code: province }] } }
    : {};

  if (entity === "organisations") {
    const rows = await prisma.organisation.findMany({
      where: { status: "PUBLISHED", mergedIntoId: null, ...provinceFilter },
      include: { province: true },
      take: 5000,
    });
    if (format === "csv") {
      const header = "slug,name,type,province,website,email\n";
      const body = rows.map((r) =>
        [r.slug, r.name, r.type, r.province?.name || "", r.website || "", r.email || ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ).join("\n");
      return new Response(header + body, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=organisations.csv" },
      });
    }
    if (format === "geojson") {
      return jsonOk({
        type: "FeatureCollection",
        features: rows
          .filter((r) => r.latitude != null && r.longitude != null)
          .map((r) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
            properties: { slug: r.slug, name: r.name, type: r.type },
          })),
      });
    }
    return jsonOk({ organisations: rows });
  }

  const rows = await prisma.location.findMany({
    where: { status: { in: ["PUBLISHED", "VERIFIED"] }, ...provinceFilter },
    include: { province: true, organisation: true },
    take: 5000,
  });

  if (format === "csv") {
    const header = "slug,name,province,organisation,latitude,longitude,verificationTier\n";
    const body = rows.map((r) =>
      [r.slug, r.name, r.province?.name || "", r.organisation?.name || "", r.latitude, r.longitude, r.verificationTier]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    return new Response(header + body, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=locations.csv" },
    });
  }

  if (format === "geojson") {
    return jsonOk({
      type: "FeatureCollection",
      features: rows
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
          properties: { slug: r.slug, name: r.name, verificationTier: r.verificationTier },
        })),
    });
  }

  return jsonOk({ locations: rows });
}
