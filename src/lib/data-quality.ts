import { prisma } from "./prisma";

export async function collectDataQuality() {
  const now = new Date();
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
    },
    byProvince,
    bySource,
    connectorRuns: connectorRuns.map((run) => ({
      connector: run.connector,
      status: run.status,
      startedAt: run.startedAt,
      rowCount: run.rowCount,
      schemaDrift: run.schemaDrift,
      sourceVersion: run.sourceVersion,
      error: run.error,
    })),
  };
}
