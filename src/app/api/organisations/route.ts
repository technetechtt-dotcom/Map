import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/shape";
import { layoutSpiralOffsets } from "@/lib/pin-layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPE_COLORS: Record<string, string> = {
  Education: "#0f766e",
  "Education / TVET": "#0d9488",
  "Education / Incubation": "#14b8a6",
  "Digital hub": "#0369a1",
  Training: "#1d4ed8",
  Government: "#b45309",
  "SMME support": "#c2410c",
  Funding: "#7c3aed",
  "Funding / R&D": "#6d28d9",
  "Research / Data": "#2563eb",
  Media: "#475569",
  default: "#334155",
};

export async function GET(req: NextRequest) {
  try {
    const location = req.nextUrl.searchParams.get("location") || "";
    const type = req.nextUrl.searchParams.get("type") || "";
    const mapMode = req.nextUrl.searchParams.get("map") === "1";
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const province = req.nextUrl.searchParams.get("province") || "";

    const [rows, towns] = await Promise.all([
      prisma.organisation.findMany({
        where: {
          status: "PUBLISHED",
          ...(province
            ? {
                province: {
                  OR: [{ slug: province }, { code: province }, { name: province }],
                },
              }
            : {}),
        },
        include: { province: true },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      }),
      prisma.location.findMany({
        where: {
          status: { in: ["PUBLISHED", "VERIFIED"] },
          ...(province
            ? {
                province: {
                  OR: [{ slug: province }, { code: province }, { name: province }],
                },
              }
            : {}),
        },
        select: {
          slug: true,
          name: true,
          latitude: true,
          longitude: true,
          district: { select: { name: true } },
        },
      }),
    ]);

    const townBySlug = Object.fromEntries(towns.map((t) => [t.slug, t]));

    let organisations = rows.map((o) => {
      const locationSlugs = parseJsonArray(o.locationSlugsJson);
      const hostTown = o.hostTownSlug ? townBySlug[o.hostTownSlug] : null;
      return {
        id: o.id,
        slug: o.slug,
        name: o.name,
        type: o.type,
        description: o.description,
        website: o.website,
        email: o.email,
        phone: o.phone,
        sourcePage: o.sourcePage,
        verified: o.verified,
        province: o.province ? { name: o.province.name, slug: o.province.slug } : null,
        locationSlugs,
        latitude: o.latitude,
        longitude: o.longitude,
        address: o.address,
        hostTownSlug: o.hostTownSlug,
        hostTownName: hostTown?.name ?? null,
        coordQuality: o.coordQuality,
        coordSource: o.coordSource,
        color: TYPE_COLORS[o.type] || TYPE_COLORS.default,
      };
    });

    if (location) {
      organisations = organisations.filter(
        (o) =>
          o.locationSlugs.includes(location) ||
          o.locationSlugs.includes("province") ||
          o.hostTownSlug === location
      );
      organisations.sort((a, b) => {
        const aExact =
          a.locationSlugs.includes(location) || a.hostTownSlug === location ? 0 : 1;
        const bExact =
          b.locationSlugs.includes(location) || b.hostTownSlug === location ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.name.localeCompare(b.name);
      });
    }

    if (type) {
      organisations = organisations.filter((o) =>
        o.type.toLowerCase().includes(type.toLowerCase())
      );
    }

    if (q) {
      organisations = organisations.filter((o) => {
        const hay = [o.name, o.type, o.description, o.email, o.phone, o.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    /** One map pin per org; near-duplicates are spiral-spidered for visibility. */
    type HubOut = {
      id: string;
      organisationId: string;
      slug: string;
      name: string;
      type: string;
      description: string | null;
      website: string | null;
      email: string | null;
      phone: string | null;
      sourcePage: string | null;
      address: string | null;
      coordQuality: string | null;
      color: string;
      latitude: number;
      longitude: number;
      trueLatitude: number;
      trueLongitude: number;
      wasSpread: boolean;
      hostTown: string | null;
      hostTownName: string | null;
      kind: "hub";
    };

    let hubs: HubOut[] = [];

    if (mapMode || req.nextUrl.searchParams.get("includeCoords") === "1") {
      const raw = organisations
        .filter(
          (o) =>
            o.latitude != null &&
            o.longitude != null &&
            Number.isFinite(o.latitude) &&
            Number.isFinite(o.longitude)
        )
        .map((o) => {
          const host = o.hostTownSlug ? townBySlug[o.hostTownSlug] : null;
          return {
            organisationId: o.id,
            slug: o.slug,
            name: o.name,
            type: o.type,
            description: o.description,
            website: o.website,
            email: o.email,
            phone: o.phone,
            sourcePage: o.sourcePage,
            address: o.address,
            coordQuality: o.coordQuality,
            color: o.color,
            latitude: o.latitude as number,
            longitude: o.longitude as number,
            hostTown: o.hostTownSlug,
            hostTownName: host?.name ?? o.hostTownName,
          };
        });

      // Wider spiral for dense Kimberley CBD (~0.5–1.2 km fan)
      const laid = layoutSpiralOffsets(raw, { radiusDeg: 0.006, precision: 3 });

      hubs = laid.map((h) => ({
        id: `hub-${h.organisationId}`,
        organisationId: h.organisationId,
        slug: h.slug,
        name: h.name,
        type: h.type,
        description: h.description,
        website: h.website,
        email: h.email,
        phone: h.phone,
        sourcePage: h.sourcePage,
        address: h.address,
        coordQuality: h.coordQuality,
        color: h.color,
        latitude: h.displayLat,
        longitude: h.displayLng,
        trueLatitude: h.latitude,
        trueLongitude: h.longitude,
        wasSpread: h.wasSpread,
        hostTown: h.hostTown,
        hostTownName: h.hostTownName,
        kind: "hub" as const,
      }));
    }

    const types = [...new Set(rows.map((o) => o.type))].sort();

    return NextResponse.json({
      count: organisations.length,
      types,
      organisations,
      hubs: mapMode || req.nextUrl.searchParams.get("includeCoords") === "1" ? hubs : undefined,
      hubCount: hubs.length || undefined,
    });
  } catch (error) {
    console.error("[api/organisations]", error);
    return NextResponse.json(
      {
        error: "Failed to load organisations",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
