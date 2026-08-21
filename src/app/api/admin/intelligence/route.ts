import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canPublish, isSuperAdmin, tenantWhere } from "@/lib/policy";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canPublish(auth.user)) return jsonError("Forbidden", 403);
  const scope = tenantWhere(auth.user);
  const relationshipScope = isSuperAdmin(auth.user)
    ? {}
    : auth.user.provinceId
      ? { source: { provinceId: auth.user.provinceId } }
      : { sourceId: "__none__" };
  const [byProvince, unverified, relationships, stale] = await Promise.all([
    prisma.organisation.groupBy({
      by: ["provinceId"],
      _count: true,
      where: { status: "PUBLISHED", mergedIntoId: null, ...scope },
    }),
    prisma.organisation.count({ where: { verified: false, status: "PUBLISHED", ...scope } }),
    prisma.organisationRelationship.groupBy({
      by: ["type"],
      _count: true,
      where: { status: "PUBLISHED", ...relationshipScope },
    }),
    prisma.location.count({ where: { staleAt: { not: null }, ...scope } }),
  ]);
  const connected = await prisma.organisationRelationship.groupBy({
    by: ["sourceId"],
    _count: { _all: true },
    where: { status: "PUBLISHED", ...relationshipScope },
  });
  const highlyConnected = connected.sort((a, b) => b._count._all - a._count._all).slice(0, 10);
  return jsonOk({
    organisationsByProvince: byProvince,
    unverifiedPublished: unverified,
    relationshipTypes: relationships,
    staleLocations: stale,
    highlyConnected,
  });
}
