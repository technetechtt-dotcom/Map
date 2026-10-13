import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canPublish, isSuperAdmin, tenantWhere } from "@/lib/policy";
import { CONNECTORS, resolveConnectorHealth } from "@/lib/ingestion/connectors";

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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    provinces,
    orgsByProvince,
    locationsByProvince,
    fundingByProvince,
    eventsByProvince,
    programmesByProvince,
    procurementByProvince,
    unverified,
    verified,
    relationships,
    stale,
    pendingSubmissions,
    connectorRuns,
    skillsProgrammes,
    infrastructureLocations,
    fundingOpen,
    tendersOpen,
    startups,
    recentlyUpdated,
    connected,
  ] = await Promise.all([
    prisma.province.findMany({ select: { id: true, name: true, code: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.organisation.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED", mergedIntoId: null, ...scope } }),
    prisma.location.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED", ...scope } }),
    prisma.fundingCall.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED", ...scope } }),
    prisma.ecosystemEvent.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED", ...scope } }),
    prisma.programme.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED", ...scope } }),
    prisma.procurement.groupBy({ by: ["provinceId"], _count: true, where: { status: "PUBLISHED", ...scope } }),
    prisma.organisation.count({ where: { verified: false, status: "PUBLISHED", ...scope } }),
    prisma.organisation.count({ where: { verified: true, status: "PUBLISHED", ...scope } }),
    prisma.organisationRelationship.groupBy({ by: ["type"], _count: true, where: { status: "PUBLISHED", ...relationshipScope } }),
    prisma.location.count({ where: { staleAt: { not: null }, ...scope } }),
    prisma.submission.count({
      where: {
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "NEEDS_INFORMATION", "DUPLICATE_SUSPECTED"] },
      },
    }),
    prisma.ingestionConnectorRun.findMany({ orderBy: { startedAt: "desc" }, take: 80 }),
    prisma.programme.count({ where: { status: "PUBLISHED", ...scope } }),
    prisma.location.count({
      where: { status: "PUBLISHED", category: { slug: { in: ["ska-data", "knowledge-hub"] } }, ...scope },
    }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED", OR: [{ deadline: null }, { deadline: { gte: new Date() } }], ...scope } }),
    prisma.procurement.count({ where: { status: "PUBLISHED", OR: [{ closingDate: null }, { closingDate: { gte: new Date() } }], ...scope } }),
    prisma.organisation.count({
      where: {
        status: "PUBLISHED",
        mergedIntoId: null,
        OR: [
          { type: { contains: "startup", mode: "insensitive" } },
          { type: { contains: "incubator", mode: "insensitive" } },
          { type: { contains: "investor", mode: "insensitive" } },
          { type: { contains: "SMME", mode: "insensitive" } },
        ],
        ...scope,
      },
    }),
    prisma.location.count({ where: { status: "PUBLISHED", updatedAt: { gte: thirtyDaysAgo }, ...scope } }),
    prisma.organisationRelationship.groupBy({
      by: ["sourceId"],
      _count: { _all: true },
      where: { status: "PUBLISHED", ...relationshipScope },
    }),
  ]);

  const latestRuns = Object.fromEntries(connectorRuns.map((run) => [run.connector, run]));
  const connectorHealth = CONNECTORS.map((c) => ({
    id: c.id,
    authority: c.authority,
    health: resolveConnectorHealth(c, latestRuns[c.id]),
    lastRetrieved: latestRuns[c.id]?.retrievedAt || null,
    rows: latestRuns[c.id]?.rowCount ?? 0,
  }));

  const countMap = (rows: { provinceId: string | null; _count: number }[]) =>
    Object.fromEntries(rows.filter((r) => r.provinceId).map((r) => [r.provinceId as string, r._count]));

  const orgMap = countMap(orgsByProvince);
  const locMap = countMap(locationsByProvince);
  const fundMap = countMap(fundingByProvince);
  const eventMap = countMap(eventsByProvince);
  const progMap = countMap(programmesByProvince);
  const procMap = countMap(procurementByProvince);

  const provinceComparisons = provinces.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    organisations: orgMap[p.id] || 0,
    locations: locMap[p.id] || 0,
    funding: fundMap[p.id] || 0,
    events: eventMap[p.id] || 0,
    programmes: progMap[p.id] || 0,
    procurement: procMap[p.id] || 0,
    coverageGap: (orgMap[p.id] || 0) < 10 || (locMap[p.id] || 0) < 5,
  }));

  const coverageGaps = provinceComparisons.filter((p) => p.coverageGap);
  const highlyConnected = connected.sort((a, b) => b._count._all - a._count._all).slice(0, 10);

  return jsonOk({
    kpis: {
      organisations: Object.values(orgMap).reduce((a, b) => a + b, 0),
      locations: Object.values(locMap).reduce((a, b) => a + b, 0),
      verifiedOrgs: verified,
      unverifiedPublished: unverified,
      verificationRate: verified + unverified ? Math.round((verified / (verified + unverified)) * 1000) / 10 : 0,
      skillsCapacity: skillsProgrammes,
      infrastructureCoverage: infrastructureLocations,
      fundingOpen,
      tenderActivity: tendersOpen,
      startupDensity: startups,
      staleLocations: stale,
      pendingSubmissions,
      recentlyUpdatedLocations: recentlyUpdated,
    },
    provinceComparisons,
    coverageGaps,
    relationshipTypes: relationships,
    highlyConnected,
    connectorHealth,
    staleAlerts: {
      staleLocations: stale,
      degradedConnectors: connectorHealth.filter((c) => c.health === "DEGRADED").map((c) => c.id),
      seedOnlyConnectors: connectorHealth.filter((c) => c.health === "SEED").length,
    },
  });
}
