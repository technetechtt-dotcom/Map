import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import {
  auditTenantWhere,
  isOrgAdmin,
  isProvincialAdmin,
  isSuperAdmin,
  submissionTenantWhere,
  tenantWhere,
} from "@/lib/policy";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN"]);
  if (auth.error) return auth.error;

  const locationWhere = tenantWhere(auth.user);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ecoFilter: any = {};
  if (isOrgAdmin(auth.user) && auth.user.organisationId) {
    ecoFilter = { organisationId: auth.user.organisationId };
  } else if (isProvincialAdmin(auth.user) && auth.user.provinceId) {
    ecoFilter = { provinceId: auth.user.provinceId };
  } else if (!isSuperAdmin(auth.user) && !isProvincialAdmin(auth.user) && !isOrgAdmin(auth.user)) {
    return jsonError("Forbidden", 403);
  }

  const analyticsWhere =
    isProvincialAdmin(auth.user) && auth.user.provinceId
      ? {
          provinceId: auth.user.provinceId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        }
      : isSuperAdmin(auth.user)
        ? { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } }
        : { id: "__none__" };

  const submissionWhere = {
    ...submissionTenantWhere(auth.user),
    status: "SUBMITTED",
  };
  const auditWhere = auditTenantWhere(auth.user);

  const [
    totalLocations,
    published,
    verified,
    draft,
    expiredVerify,
    townCentreCoords,
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
    prisma.location.count({
      where: {
        ...locationWhere,
        verificationExpiresAt: { lt: new Date() },
        status: { in: ["PUBLISHED", "VERIFIED"] },
      },
    }),
    prisma.location.count({
      where: { ...locationWhere, coordQuality: { in: ["town-centre", "unknown"] } },
    }),
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
    prisma.fundingCall.count({ where: { status: "PUBLISHED", ...ecoFilter } }),
    prisma.ecosystemEvent.count({ where: { status: "PUBLISHED", ...ecoFilter } }),
    prisma.programme.count({ where: { status: "PUBLISHED", ...ecoFilter } }),
    prisma.procurement.count({ where: { status: "PUBLISHED", ...ecoFilter } }),
    canShowSubmissions(auth.user)
      ? prisma.submission.count({ where: submissionWhere })
      : Promise.resolve(0),
    prisma.analyticsEvent.count({ where: analyticsWhere }),
    canShowAudit(auth.user)
      ? prisma.auditLog.findMany({
          where: auditWhere,
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        })
      : Promise.resolve([]),
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
      expiredVerify,
      townCentreCoords,
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
    recentAudit: audits.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt,
      provinceId: a.provinceId,
      user: a.user
        ? {
            name: a.user.name,
            email: isSuperAdmin(auth.user) ? a.user.email : undefined,
          }
        : null,
    })),
  });
}

function canShowSubmissions(user: { role?: string }) {
  return user.role === "SUPER_ADMIN" || user.role === "PROVINCIAL_ADMIN";
}
function canShowAudit(user: { role?: string }) {
  return user.role === "SUPER_ADMIN" || user.role === "PROVINCIAL_ADMIN";
}
