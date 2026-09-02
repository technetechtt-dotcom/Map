import { prisma } from "./prisma";

const PROVINCE_CODES = ["NC", "EC", "FS", "GP", "KZN", "LP", "MP", "NW", "WC"] as const;

export async function collectDataQuality() {
  const now = new Date();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [
    locations,
    published,
    verified,
    current,
    stale,
    missing,
    orgs,
    unverifiedOrgs,
    failedRows,
    observations,
    conflicts,
    connectorRuns,
    identityCount,
    directoryLocations,
    stagedBatches,
    appliedBatches,
    schemaDriftRuns,
    provinces,
  ] = await Promise.all([
    prisma.location.count(),
    prisma.location.count({ where: { status: { in: ["PUBLISHED", "VERIFIED"] } } }),
    prisma.location.count({ where: { verificationTier: { in: ["desktop", "field"] } } }),
    prisma.location.count({ where: { verificationExpiresAt: { gt: now }, status: { in: ["PUBLISHED", "VERIFIED"] } } }),
    prisma.location.count({ where: { OR: [{ staleAt: { not: null } }, { verificationExpiresAt: { lt: now } }] } }),
    prisma.location.count({ where: { missingFromSource: true } }),
    prisma.organisation.count({ where: { mergedIntoId: null } }),
    prisma.organisation.count({ where: { mergedIntoId: null, verified: false, status: "PUBLISHED" } }),
    prisma.importBatch.aggregate({ _sum: { rowCount: true, appliedCount: true } }),
    prisma.sourceObservation.count(),
    prisma.fieldAuthority.count(),
    prisma.ingestionConnectorRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.externalIdentity.count({ where: { entityType: "location" } }),
    prisma.location.count({ where: { verificationTier: "directory" } }),
    prisma.importBatch.aggregate({ _sum: { rowCount: true }, where: { status: { not: "APPLIED" } } }),
    prisma.importBatch.aggregate({ _sum: { appliedCount: true } }),
    prisma.ingestionConnectorRun.count({ where: { schemaDrift: true, startedAt: { gte: weekAgo } } }),
    prisma.province.findMany({ select: { id: true, code: true, name: true, slug: true } }),
  ]);
  const failedImport = (failedRows._sum.rowCount || 0) - (failedRows._sum.appliedCount || 0);
  const coverage = locations === 0 ? 0 : published / locations;
  const verifiedPct = published === 0 ? 0 : verified / published;
  const currentPct = published === 0 ? 0 : current / published;
  const byProvince = await prisma.location.groupBy({
    by: ["provinceId", "status"],
    _count: true,
  });
  const bySource = await prisma.sourceObservation.groupBy({
    by: ["connector"],
    _count: true,
    _max: { lastSeenAt: true },
  });

  const provinceCoverage = await Promise.all(
    provinces.map(async (p) => {
      const [locTotal, locPublished, locDirectory, orgTotal] = await Promise.all([
        prisma.location.count({ where: { provinceId: p.id } }),
        prisma.location.count({ where: { provinceId: p.id, status: { in: ["PUBLISHED", "VERIFIED"] } } }),
        prisma.location.count({ where: { provinceId: p.id, verificationTier: "directory" } }),
        prisma.organisation.count({ where: { provinceId: p.id, mergedIntoId: null } }),
      ]);
      const freshness = bySource
        .filter((s) => s._max.lastSeenAt)
        .map((s) => ({ connector: s.connector, lastSeenAt: s._max.lastSeenAt }));
      return {
        code: p.code,
        slug: p.slug,
        name: p.name,
        locations: locTotal,
        published: locPublished,
        directoryPins: locDirectory,
        organisations: orgTotal,
        coveragePct: locTotal === 0 ? 0 : Math.round((locPublished / locTotal) * 1000) / 10,
        freshness,
      };
    })
  );

  const connectorsHealthy = connectorRuns.filter((r) => !r.schemaDrift && r.status !== "schema-drift").length;
  const identityCoveragePct =
    directoryLocations === 0 ? 0 : Math.round((identityCount / directoryLocations) * 1000) / 10;

  return {
    generatedAt: now.toISOString(),
    kpis: {
      coveragePct: Math.round(coverage * 1000) / 10,
      verifiedPct: Math.round(verifiedPct * 1000) / 10,
      currentPct: Math.round(currentPct * 1000) / 10,
      stalePct: locations === 0 ? 0 : Math.round((stale / locations) * 1000) / 10,
      missingFromSource: missing,
      organisations: orgs,
      unverifiedOrganisations: unverifiedOrgs,
      failedIngestionRows: Math.max(0, failedImport),
      sourceObservations: observations,
      fieldAuthorities: conflicts,
      identityCoveragePct,
      connectorsHealthy,
      connectorsTotal: connectorRuns.length,
      schemaDriftEvents7d: schemaDriftRuns,
      stagedRowsPending: stagedBatches._sum.rowCount || 0,
      appliedRowsTotal: appliedBatches._sum.appliedCount || 0,
      nationalProvincesTracked: provinceCoverage.filter((p) => PROVINCE_CODES.includes(p.code as (typeof PROVINCE_CODES)[number])).length,
    },
    provinceCoverage,
    byProvince,
    bySource,
    connectorRuns: connectorRuns.map((run) => ({
      connector: run.connector,
      status: run.status,
      startedAt: run.startedAt,
      rowCount: run.rowCount,
      schemaDrift: run.schemaDrift,
      sourceVersion: run.sourceVersion,
      latencyMs: run.latencyMs,
      error: run.error,
    })),
  };
}
