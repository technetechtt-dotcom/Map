import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { isOrgAdmin, isProvincialAdmin, isSuperAdmin, tenantWhere } from "@/lib/policy";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"]);
  if (auth.error) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provinceFilter: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let locationWhere: any = tenantWhere(auth.user);

  if (isOrgAdmin(auth.user) && auth.user.organisationId) {
    provinceFilter = { organisationId: auth.user.organisationId };
    locationWhere = { organisationId: auth.user.organisationId };
  } else if (isProvincialAdmin(auth.user) && auth.user.provinceId) {
    provinceFilter = { provinceId: auth.user.provinceId };
  } else if (!isSuperAdmin(auth.user) && !isProvincialAdmin(auth.user) && !isOrgAdmin(auth.user)) {
    return jsonError("Forbidden", 403);
  }

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
    prisma.location.count({ where: locationWhere }),
    prisma.location.count({ where: { ...locationWhere, status: "PUBLISHED" } }),
    prisma.location.count({ where: { ...locationWhere, lastVerifiedAt: { not: null } } }),
    prisma.location.count({ where: { ...locationWhere, status: "DRAFT" } }),
    prisma.location.groupBy({
      by: ["categoryId"],
      where: locationWhere,
      _count: true,
    }),
    prisma.location.groupBy({
      by: ["provinceId"],
      where: locationWhere,
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
      openSubmissions: isSuperAdmin(auth.user) || isProvincialAdmin(auth.user) ? submissions : 0,
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
    recentAudit: isSuperAdmin(auth.user) || isProvincialAdmin(auth.user) ? audits : [],
  });
}
