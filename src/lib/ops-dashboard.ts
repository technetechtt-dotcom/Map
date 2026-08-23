import { collectMetrics, pingDatabase } from "./metrics";
import { isMaintenanceMode, getSetting } from "./settings";
import { listDeadLetters } from "./jobs";
import { prisma } from "./prisma";
import { isSuperAdmin, tenantWhere, type AuthUser } from "./policy";

export const SUPER_OPS_JOBS = ["expiry", "prune", "backup", "analytics", "cleanup", "notify", "geocode", "report", "ingest"] as const;
export const PROVINCIAL_OPS_JOBS = ["expiry", "geocode", "analytics", "report"] as const;

export function opsJobsForRole(user?: AuthUser | null) {
  return isSuperAdmin(user) ? [...SUPER_OPS_JOBS] : [...PROVINCIAL_OPS_JOBS];
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

  const [work, metrics, redis, settingsMessage, deadLetters, backups] = await Promise.all([
    Promise.all([
      prisma.location.count({
        where: { ...scope, status: { in: ["PUBLISHED", "VERIFIED"] }, verificationExpiresAt: { lt: new Date() } },
      }),
      prisma.dataSubjectRequest.count({
        where: { status: "OPEN", ...(user.provinceId && !superAdmin ? { provinceId: user.provinceId } : {}) },
      }),
      prisma.submission.count({
        where: { status: "SUBMITTED", ...(user.provinceId && !superAdmin ? { provinceId: user.provinceId } : {}) },
      }),
    ]),
    collectMetrics().catch(() => null),
    pingRedis(),
    getSetting("maintenance_message"),
    superAdmin ? listDeadLetters(25) : Promise.resolve([]),
    superAdmin
      ? prisma.backupRecord.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, kind: true, filename: true, checksumSha256: true, objectsCopied: true, createdAt: true, sizeBytes: true },
        })
      : Promise.resolve([]),
  ]);

  const [expiredVerifications, openDsar, openSubmissions] = work;
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
    work: { expiredVerifications, openDsar, openSubmissions },
    queue: superAdmin ? metrics?.queue ?? null : null,
    notifications: superAdmin ? metrics?.notifications ?? null : null,
    verification: { expired: expiredVerifications },
    backup: superAdmin ? metrics?.backup ?? null : null,
    worker: superAdmin ? metrics?.worker ?? null : null,
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
