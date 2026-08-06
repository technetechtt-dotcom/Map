import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES } from "@/lib/shape";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const province = req.nextUrl.searchParams.get("province") || "northern-cape";

    const [categories, provinces, districts, stats] = await Promise.all([
      prisma.category.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          color: true,
          icon: true,
          description: true,
        },
      }),
      prisma.province.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          slug: true,
          centerLat: true,
          centerLng: true,
          defaultZoom: true,
        },
      }),
      prisma.district.findMany({
        where: province
          ? {
              province: {
                OR: [{ slug: province }, { code: province }, { name: province }],
              },
            }
          : undefined,
        include: { municipalities: { select: { id: true, code: true, name: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.location.groupBy({
        by: ["status"],
        where: { status: { in: [...PUBLIC_STATUSES] } },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      categories,
      provinces,
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
      /** Public status tallies only (no draft/archive exposure) */
      statusCounts: stats,
    });
  } catch (error) {
    console.error("[api/meta]", error);
    return NextResponse.json({ error: "Failed to load metadata" }, { status: 500 });
  }
}
