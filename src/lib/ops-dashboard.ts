import { collectMetrics, pingDatabase } from "./metrics";
import { productionBootGaps } from "./production-boot";
import { isMaintenanceMode, getSetting } from "./settings";
import { listDeadLetters } from "./jobs";
import { prisma } from "./prisma";
import { isSuperAdmin, tenantWhere, type AuthUser } from "./policy";

export const SUPER_OPS_JOBS = ["expiry", "prune", "backup", "analytics", "cleanup", "notify", "geocode", "report", "ingest", "reverify"] as const;
export const PROVINCIAL_OPS_JOBS = ["expiry", "geocode", "analytics", "report"] as const;

export const RUNTIME_SECRET_FLAGS = [
  "NEXTAUTH_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
  "BACKUP_ENCRYPTION_KEY",
  "CRON_SECRET",
  "METRICS_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "S3_BUCKET",
  "S3_BACKUP_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_BACKUP_ACCESS_KEY_ID",
  "NOTIFY_WEBHOOK_URL",
  "RESEND_API_KEY",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
] as const;

export function opsJobsForRole(user?: AuthUser | null) {
  return isSuperAdmin(user) ? [...SUPER_OPS_JOBS] : [...PROVINCIAL_OPS_JOBS];
}

/** Boolean presence only — never returns secret values. */
export function runtimeSecretPresence(env: Record<string, string | undefined> = process.env) {
  return Object.fromEntries(
    RUNTIME_SECRET_FLAGS.map((key) => [key, Boolean((env[key] || "").trim())])
  ) as Record<(typeof RUNTIME_SECRET_FLAGS)[number], boolean>;
}

export function runtimeReadiness(env: Record<string, string | undefined> = process.env) {
  const secrets = runtimeSecretPresence(env);
  const bootGaps = env.NODE_ENV === "production" ? productionBootGaps(env as NodeJS.ProcessEnv) : [];
  const missingRuntime = RUNTIME_SECRET_FLAGS.filter((key) => !secrets[key]);
  return {
    nodeEnv: env.NODE_ENV || "development",
    bootGaps,
    secrets,
    missingRuntime,
    githubHint: "GitHub Environment production secrets are not visible here. See docs/ops-secrets.md.",
  };
}

async function pingRedis(): Promise<"ok" | "skipped" | "error"> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return "skipped";
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "")}/ping`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(2500),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function collectOpsDashboard(user: AuthUser) {
  const superAdmin = isSuperAdmin(user);
  const scope = tenantWhere(user);
  const maintenance = await isMaintenanceMode();
  const envOverride = process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";

  const provinceScope = user.provinceId && !superAdmin ? { provinceId: user.provinceId } : {};
  const [work, metrics, redis, settingsMessage, deadLetters, backups, recentJobs, catalogue] = await Promise.all([
    Promise.all([
      prisma.location.count({
        where: { ...scope, status: { in: ["PUBLISHED", "VERIFIED"] }, verificationExpiresAt: { lt: new Date() } },
      }),
      prisma.dataSubjectRequest.count({
        where: { status: "OPEN", ...provinceScope },
      }),
      prisma.submission.count({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, ...provinceScope },
      }),
    ]),
    collectMetrics().catch(() => null),
    pingRedis(),
    getSetting("maintenance_message"),
    superAdmin ? listDeadLetters(25) : Promise.resolve([]),
    superAdmin
      ? prisma.backupRecord.findMany({
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            kind: true,
            filename: true,
            checksumSha256: true,
            objectsCopied: true,
            createdAt: true,
            sizeBytes: true,
            status: true,
            failureReason: true,
            backupRunId: true,
          },
        })
      : Promise.resolve([]),
    superAdmin
      ? prisma.backgroundJob.findMany({
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            type: true,
            status: true,
            attempts: true,
            lastError: true,
            deadLetter: true,
            createdAt: true,
            completedAt: true,
          },
        })
      : Promise.resolve([]),
    Promise.all([
      prisma.location.count({ where: { ...scope, status: { in: ["PUBLISHED", "VERIFIED"] } } }),
      prisma.organisation.count({ where: { status: "PUBLISHED", ...provinceScope } }),
      prisma.fundingCall.count({ where: { status: "PUBLISHED", ...provinceScope } }),
      prisma.ecosystemEvent.count({ where: { status: "PUBLISHED", ...provinceScope } }),
      prisma.programme.count({ where: { status: "PUBLISHED", ...provinceScope } }),
      prisma.procurement.count({ where: { status: "PUBLISHED", ...provinceScope } }),
      prisma.fundingCall.count({ where: { status: { in: ["DRAFT", "PENDING_REVIEW"] }, ...provinceScope } }),
      prisma.ecosystemEvent.count({ where: { status: { in: ["DRAFT", "PENDING_REVIEW"] }, ...provinceScope } }),
      prisma.programme.count({ where: { status: { in: ["DRAFT", "PENDING_REVIEW"] }, ...provinceScope } }),
      prisma.procurement.count({ where: { status: { in: ["DRAFT", "PENDING_REVIEW"] }, ...provinceScope } }),
    ]),
  ]);

  const [expiredVerifications, openDsar, openSubmissions] = work;
  const [locations, organisations, funding, events, programmes, procurement, fundingDrafts, eventDrafts, programmeDrafts, procurementDrafts] =
    catalogue;
  const ecosystemDrafts = fundingDrafts + eventDrafts + programmeDrafts + procurementDrafts;
  let db: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = metrics?.dbLatencyMs ?? null;
  if (!metrics) {
    try {
      dbLatencyMs = await pingDatabase();
    } catch {
      db = "error";
    }
  }

  const backupStale = Boolean(metrics?.backup.stale);
  const status =
    db === "ok" && redis !== "error" && !maintenance ? (backupStale && superAdmin ? "degraded" : "ok") : maintenance ? "maintenance" : "degraded";

  return {
    role: user.role,
    scope: superAdmin ? "national" : "province",
    collectedAt: new Date().toISOString(),
    health: {
      status,
      db,
      redis,
      dbLatencyMs,
      maintenance,
      version: process.env.npm_package_version || "1.3.0",
      sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.GIT_COMMIT || null,
    },
    work: { expiredVerifications, openDsar, openSubmissions, ecosystemDrafts },
    catalogue: { locations, organisations, funding, events, programmes, procurement },
    queue: superAdmin ? metrics?.queue ?? null : null,
    notifications: superAdmin ? metrics?.notifications ?? null : null,
    verification: { expired: expiredVerifications },
    backup: superAdmin ? metrics?.backup ?? null : null,
    worker: superAdmin ? metrics?.worker ?? null : null,
    readiness: superAdmin ? runtimeReadiness() : null,
    recentJobs,
    alerts: superAdmin
      ? {
          backupStale,
          databaseBackupStale: metrics?.backup.database.stale ?? true,
          objectBackupStale: metrics?.backup.objects.stale ?? true,
          appExportStale: metrics?.backup.appExport.stale ?? false,
          workerUnhealthy: metrics ? metrics.worker.healthy === false : true,
        }
      : null,
    deadLetters,
    backups,
    settings: {
      maintenance,
      envOverride,
      message: settingsMessage || null,
    },
    jobs: opsJobsForRole(user),
  };
}
