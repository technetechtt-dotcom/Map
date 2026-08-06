import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const province = req.nextUrl.searchParams.get("province") || "northern-cape";

    const [categories, provinces, districts, stats] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.province.findMany({ orderBy: { name: "asc" } }),
      prisma.district.findMany({
        where: province
          ? {
              province: {
                OR: [{ slug: province }, { code: province }, { name: province }],
              },
            }
          : undefined,
        include: { municipalities: true },
        orderBy: { name: "asc" },
      }),
      prisma.location.groupBy({
        by: ["status"],
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
      statusCounts: stats,
    });
  } catch (error) {
    console.error("[api/meta]", error);
    return NextResponse.json(
      {
        error: "Failed to load metadata",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
