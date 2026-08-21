import { prisma } from "./prisma";

export async function collectMetrics() {
  const started = Date.now();
  const dbStarted = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - dbStarted;

  const [
    pendingJobs,
    runningJobs,
    failedJobs,
    deadLetter,
    failedNotifications,
    expiredVerifications,
    lastBackup,
    worker,
  ] = await Promise.all([
    prisma.backgroundJob.count({ where: { status: "PENDING" } }),
    prisma.backgroundJob.count({ where: { status: "RUNNING" } }),
    prisma.backgroundJob.count({ where: { status: "FAILED" } }),
    prisma.backgroundJob.count({ where: { deadLetter: true } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
    prisma.location.count({ where: { verificationExpiresAt: { lt: new Date() }, status: { in: ["PUBLISHED", "VERIFIED"] } } }),
    prisma.backupRecord.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, checksumSha256: true, objectsCopied: true, rpoMinutes: true, rtoMinutes: true } }),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } }),
  ]);

  const backupAgeHours = lastBackup ? (Date.now() - lastBackup.createdAt.getTime()) / 36e5 : null;
  return {
    collectedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    dbLatencyMs,
    queue: { pending: pendingJobs, running: runningJobs, failed: failedJobs, deadLetter },
    notifications: { failed: failedNotifications },
    verification: { expired: expiredVerifications },
    backup: {
      ageHours: backupAgeHours,
      stale: backupAgeHours != null ? backupAgeHours > 36 : true,
      checksum: lastBackup?.checksumSha256 || null,
      objectsCopied: lastBackup?.objectsCopied || 0,
      rpoMinutes: lastBackup?.rpoMinutes ?? 1440,
      rtoMinutes: lastBackup?.rtoMinutes ?? 120,
    },
    worker: worker
      ? { workerId: worker.workerId, lastSeenAt: worker.lastSeenAt, queueDepth: worker.queueDepth, healthy: Date.now() - worker.lastSeenAt.getTime() < 5 * 60_000 }
      : { healthy: false },
  };
}

/** Public liveness fields — no queue, backup, worker, or verification internals. */
export function publicHealthFromMetrics(metrics: Awaited<ReturnType<typeof collectMetrics>> | null) {
  void metrics;
  return {};
}
