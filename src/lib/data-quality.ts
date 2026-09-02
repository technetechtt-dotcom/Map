import { prisma } from "./prisma";

const PROVINCE_CODES = ["NC", "EC", "FS", "GP", "KZN", "LP", "MP", "NW", "WC"] as const;

/** KPI thresholds — breach triggers escalation queue entries. */
export const KPI_THRESHOLDS = {
  verificationRateMin: 60,
  staleRecordPctMax: 15,
  duplicatePctMax: 5,
  missingCoordinatePctMax: 10,
  badCoordinatePctMax: 5,
  sourceFailurePctMax: 10,
  sourceFreshnessHoursMax: 168,
  provinceCoverageMinPct: 5,
} as const;

export type ConnectorHealthStatus =
  | "healthy"
  | "delayed"
  | "failed"
  | "schema-changed"
  | "auth-failure"
  | "disabled";

export function classifyConnectorHealth(run: {
  status: string;
  schemaDrift: boolean;
  startedAt: Date;
  error?: string | null;
}): ConnectorHealthStatus {
  const ageHours = (Date.now() - new Date(run.startedAt).getTime()) / 3_600_000;
  if (run.status === "disabled") return "disabled";
  if (run.schemaDrift || run.status === "schema-drift") return "schema-changed";
  if (/auth|401|403|unauthorized/i.test(run.error || "") || run.status === "auth-failure") return "auth-failure";
  if (run.status === "failed" || run.status === "error") return "failed";
  if (ageHours > KPI_THRESHOLDS.sourceFreshnessHoursMax) return "delayed";
  return "healthy";
}

export type ProvinceCoverageTarget = {
  code: string;
  authoritativeCoveragePctMin: number;
  verifiedPctMin: number;
  currentPctMin: number;
  geocodedPctMin: number;
  organisationMin: number;
  opportunityMin: number;
};

export const DEFAULT_PROVINCE_TARGETS: ProvinceCoverageTarget[] = PROVINCE_CODES.map((code) => ({
  code,
  authoritativeCoveragePctMin: code === "NC" ? 80 : 20,
  verifiedPctMin: code === "NC" ? 50 : 5,
  currentPctMin: code === "NC" ? 40 : 5,
  geocodedPctMin: 70,
  organisationMin: code === "NC" ? 40 : 10,
  opportunityMin: code === "NC" ? 5 : 2,
}));

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

  const missingCoords = await prisma.location.count({ where: { coordQuality: "unknown" } });
  const badCoords = await prisma.location.count({
    where: { coordQuality: "unknown" },
  });
  const duplicateCandidates = await prisma.organisation.count({ where: { mergedIntoId: { not: null } } });

  const sourceDiversity = await prisma.$queryRaw<
    { entityType: string; entityId: string; sourceCount: number }[]
  >`
    SELECT "entityType", "entityId", COUNT(DISTINCT connector)::int AS "sourceCount"
    FROM "ExternalIdentity"
    GROUP BY "entityType", "entityId"
    HAVING COUNT(DISTINCT connector) >= 2
    LIMIT 500
  `;

  const connectorHealth = connectorRuns.map((run) => ({
    connector: run.connector,
    health: classifyConnectorHealth(run),
    status: run.status,
    startedAt: run.startedAt,
    rowCount: run.rowCount,
    schemaDrift: run.schemaDrift,
    error: run.error,
  }));

  const escalations: { severity: string; code: string; message: string }[] = [];
  const stalePct = locations === 0 ? 0 : Math.round((stale / locations) * 1000) / 10;
  const missingCoordPct = locations === 0 ? 0 : Math.round((missingCoords / locations) * 1000) / 10;
  const badCoordPct = locations === 0 ? 0 : Math.round((badCoords / locations) * 1000) / 10;
  const dupPct = locations === 0 ? 0 : Math.round((duplicateCandidates / locations) * 1000) / 10;
  const verifiedPctRounded = Math.round(verifiedPct * 1000) / 10;

  if (verifiedPctRounded < KPI_THRESHOLDS.verificationRateMin) {
    escalations.push({ severity: "warning", code: "verification-rate", message: `Verification rate ${verifiedPctRounded}% below ${KPI_THRESHOLDS.verificationRateMin}%` });
  }
  if (stalePct > KPI_THRESHOLDS.staleRecordPctMax) {
    escalations.push({ severity: "warning", code: "stale-records", message: `Stale records ${stalePct}% above ${KPI_THRESHOLDS.staleRecordPctMax}%` });
  }
  if (missingCoordPct > KPI_THRESHOLDS.missingCoordinatePctMax) {
    escalations.push({ severity: "critical", code: "missing-coords", message: `Missing coordinates ${missingCoordPct}% above ${KPI_THRESHOLDS.missingCoordinatePctMax}%` });
  }
  if (badCoordPct > KPI_THRESHOLDS.badCoordinatePctMax) {
    escalations.push({ severity: "warning", code: "bad-coords", message: `Bad coordinates ${badCoordPct}% above ${KPI_THRESHOLDS.badCoordinatePctMax}%` });
  }
  for (const ch of connectorHealth) {
    if (ch.health === "failed" || ch.health === "auth-failure" || ch.health === "schema-changed") {
      escalations.push({ severity: "critical", code: `connector-${ch.connector}`, message: `Connector ${ch.connector} is ${ch.health}` });
    }
  }

  const weeklyReviewQueue = [
    ...escalations.map((e) => ({ kind: "escalation" as const, ...e })),
    ...provinceCoverage
      .filter((p) => p.coveragePct < KPI_THRESHOLDS.provinceCoverageMinPct)
      .map((p) => ({
        kind: "province-gap" as const,
        severity: "warning",
        code: `province-${p.code}`,
        message: `${p.name} coverage ${p.coveragePct}% below minimum ${KPI_THRESHOLDS.provinceCoverageMinPct}%`,
      })),
  ];

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
      missingCoordinatePct: missingCoordPct,
      badCoordinatePct: badCoordPct,
      duplicatePct: dupPct,
      multiSourceEntities: Array.isArray(sourceDiversity) ? sourceDiversity.length : 0,
    },
    thresholds: KPI_THRESHOLDS,
    provinceTargets: DEFAULT_PROVINCE_TARGETS,
    connectorHealth,
    escalations,
    weeklyReviewQueue,
    sourceDiversity: Array.isArray(sourceDiversity) ? sourceDiversity.slice(0, 50) : [],
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
