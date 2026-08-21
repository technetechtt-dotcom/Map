import { prisma } from "./prisma";
import { collectBackupHealth } from "./backup-health";

export function isWorkerHealthy(lastSeenAt: Date, now = Date.now()) {
  return now - lastSeenAt.getTime() < 5 * 60_000;
}

export async function pingDatabase() {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return Date.now() - started;
}

export async function collectMetrics() {
  const started = Date.now();
  const dbLatencyMs = await pingDatabase();

  const [pendingJobs, runningJobs, failedJobs, deadLetter, failedNotifications, expiredVerifications, worker, backup] =
    await Promise.all([
      prisma.backgroundJob.count({ where: { status: "PENDING" } }),
      prisma.backgroundJob.count({ where: { status: "RUNNING" } }),
      prisma.backgroundJob.count({ where: { status: "FAILED" } }),
      prisma.backgroundJob.count({ where: { deadLetter: true } }),
      prisma.notification.count({ where: { status: "FAILED" } }),
      prisma.location.count({ where: { verificationExpiresAt: { lt: new Date() }, status: { in: ["PUBLISHED", "VERIFIED"] } } }),
      prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } }),
      collectBackupHealth(),
    ]);

  return {
    collectedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    dbLatencyMs,
    queue: { pending: pendingJobs, running: runningJobs, failed: failedJobs, deadLetter },
    notifications: { failed: failedNotifications },
    verification: { expired: expiredVerifications },
    backup,
    worker: worker
      ? { workerId: worker.workerId, lastSeenAt: worker.lastSeenAt, queueDepth: worker.queueDepth, healthy: isWorkerHealthy(worker.lastSeenAt) }
      : { healthy: false },
  };
}

/** Public liveness fields — no queue, backup, worker, or verification internals. */
export function publicHealthFromMetrics(metrics: Awaited<ReturnType<typeof collectMetrics>> | null) {
  void metrics;
  return {};
}
