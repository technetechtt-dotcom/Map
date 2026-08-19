import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canPublish } from "@/lib/policy";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canPublish(auth.user)) return jsonError("Forbidden", 403);
  const [byProvince, unverified, relationships, stale] = await Promise.all([
    prisma.organisation.groupBy({
      by: ["provinceId"],
      _count: true,
      where: { status: "PUBLISHED", mergedIntoId: null },
    }),
    prisma.organisation.count({ where: { verified: false, status: "PUBLISHED" } }),
    prisma.organisationRelationship.groupBy({ by: ["type"], _count: true, where: { status: "PUBLISHED" } }),
    prisma.location.count({ where: { staleAt: { not: null } } }),
  ]);
  const connected = await prisma.organisationRelationship.groupBy({
    by: ["sourceId"],
    _count: { _all: true },
    where: { status: "PUBLISHED" },
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
