import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, shapeLocation } from "@/lib/shape";
import { trackEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim().toLowerCase() || "";
    const province = sp.get("province") || "";
    const district = sp.get("district") || "";
    const category = sp.get("category") || "";
    const status = sp.get("status") || "";
    const verifiedOnly = sp.get("verified") === "1";
    const bounds = sp.get("bounds");
    const includeAll = sp.get("admin") === "1";
    const limit = Math.min(Number(sp.get("limit") || 500), 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (!includeAll) {
      where.status = { in: PUBLIC_STATUSES };
    } else if (status) {
      where.status = status;
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
    });

    let shaped = rows.map(shapeLocation);
    if (q) {
      shaped = shaped.filter((x) => {
        const hay = [
          x.name,
          x.summary,
          x.category.name,
          x.district?.name,
          x.municipality?.name,
          x.province.name,
          ...x.opportunities,
          ...x.assets,
          ...x.tags,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    trackEvent({
      eventType: "locations.search",
      path: "/api/locations",
      metadata: { q, province, district, category, count: shaped.length },
    }).catch(() => undefined);

    return NextResponse.json({ count: shaped.length, locations: shaped });
  } catch (error) {
    console.error("[api/locations]", error);
    return NextResponse.json(
      {
        error: "Failed to load locations",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
