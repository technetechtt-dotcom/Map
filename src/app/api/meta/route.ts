import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES } from "@/lib/shape";
import { districtFill } from "@/lib/boundary-colors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const META_CACHE_MS = 120_000;
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" };

const globalForMeta = globalThis as unknown as {
  __ictMetaCache?: Map<string, { expires: number; body: unknown }>;
  __ictMetaInflight?: Map<string, Promise<unknown>>;
};
const metaCache = globalForMeta.__ictMetaCache ?? new Map<string, { expires: number; body: unknown }>();
const metaInflight = globalForMeta.__ictMetaInflight ?? new Map<string, Promise<unknown>>();
globalForMeta.__ictMetaCache = metaCache;
globalForMeta.__ictMetaInflight = metaInflight;

async function loadMeta(province: string) {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      color: true,
      icon: true,
      description: true,
    },
  });
  const provinces = await prisma.province.findMany({
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
  });
  const districts = await prisma.district.findMany({
    where: province
      ? {
          province: {
            OR: [{ slug: province }, { code: province }, { name: province }],
          },
        }
      : undefined,
    include: { municipalities: { select: { id: true, code: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const stats = await prisma.location.groupBy({
    by: ["status"],
    where: { status: { in: [...PUBLIC_STATUSES] } },
    _count: true,
  });

  return {
    categories,
    provinces,
    districts: districts.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      fill: districtFill(d.code, d.name),
      municipalities: d.municipalities.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
      })),
    })),
    /** Public status tallies only (no draft/archive exposure) */
    statusCounts: stats,
  };
}

export async function GET(req: NextRequest) {
  try {
    const province = req.nextUrl.searchParams.get("province") || "";
    const cacheKey = province || "all";
    const hit = metaCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return NextResponse.json(hit.body, { headers: CACHE_HEADERS });
    }

    let pending = metaInflight.get(cacheKey);
    if (!pending) {
      pending = loadMeta(province)
        .then((body) => {
          metaCache.set(cacheKey, { expires: Date.now() + META_CACHE_MS, body });
          return body;
        })
        .finally(() => metaInflight.delete(cacheKey));
      metaInflight.set(cacheKey, pending);
    }

    const body = await pending;
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("[api/meta]", error);
    return NextResponse.json({ error: "Failed to load metadata" }, { status: 500 });
  }
}
