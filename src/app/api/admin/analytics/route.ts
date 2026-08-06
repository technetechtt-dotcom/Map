import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession } from "@/lib/api";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"]);
  if (auth.error) return auth.error;

  const provinceFilter =
    auth.user.role === "PROVINCIAL_ADMIN" && auth.user.provinceId
      ? { provinceId: auth.user.provinceId }
      : {};

  const [
    totalLocations,
    published,
    verified,
    draft,
    byCategory,
    byProvince,
    funding,
    events,
    programmes,
    procurements,
    submissions,
    recentViews,
    audits,
  ] = await Promise.all([
    prisma.location.count({ where: provinceFilter }),
    prisma.location.count({ where: { ...provinceFilter, status: "PUBLISHED" } }),
    prisma.location.count({ where: { ...provinceFilter, lastVerifiedAt: { not: null } } }),
    prisma.location.count({ where: { ...provinceFilter, status: "DRAFT" } }),
    prisma.location.groupBy({
      by: ["categoryId"],
      where: provinceFilter,
      _count: true,
    }),
    prisma.location.groupBy({
      by: ["provinceId"],
      _count: true,
    }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED", ...provinceFilter } }),
    prisma.ecosystemEvent.count({ where: { status: "PUBLISHED", ...provinceFilter } }),
    prisma.programme.count({ where: { status: "PUBLISHED", ...provinceFilter } }),
    prisma.procurement.count({ where: { status: "PUBLISHED", ...provinceFilter } }),
    prisma.submission.count({ where: { status: "SUBMITTED" } }),
    prisma.analyticsEvent.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
      },
    }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const categories = await prisma.category.findMany();
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const provinces = await prisma.province.findMany();
  const provMap = Object.fromEntries(provinces.map((p) => [p.id, p.name]));

  return jsonOk({
    totals: {
      totalLocations,
      published,
      verified,
      draft,
      funding,
      events,
      programmes,
      procurements,
      openSubmissions: submissions,
      analyticsEvents7d: recentViews,
    },
    byCategory: byCategory.map((r) => ({
      name: catMap[r.categoryId] || r.categoryId,
      count: r._count,
    })),
    byProvince: byProvince.map((r) => ({
      name: provMap[r.provinceId] || r.provinceId,
      count: r._count,
    })),
    recentAudit: audits,
  });
}
