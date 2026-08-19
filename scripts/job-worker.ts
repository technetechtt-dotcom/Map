import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";
import { deliverNotification } from "../src/lib/notify";
import { claimJobs } from "../src/lib/jobs";
import { log } from "../src/lib/logger";

const workerId = `${process.env.HOSTNAME || "worker"}:${randomUUID()}`;

async function cycle() {
  const notifications = await prisma.notification.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() }, attempts: { lt: 5 } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  for (const notification of notifications) {
    await deliverNotification(notification.id).catch((error) =>
      log.warn("worker.notification_failed", { id: notification.id, detail: String(error) })
    );
  }

  const jobs = await claimJobs(workerId);
  for (const job of jobs) {
    try {
      // Specialized workers can claim imports, geocoding, duplicates, backups,
      // expiry, analytics and reports by type. Unknown jobs fail visibly and
      // are retried with bounded exponential backoff.
      throw new Error(`No handler registered for ${job.type}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const terminal = job.attempts >= job.maxAttempts;
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          lastError: message.slice(0, 2000),
          runAfter: new Date(Date.now() + Math.min(60, 2 ** Math.max(0, job.attempts - 1)) * 60_000),
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
  }
  log.info("worker.cycle", { notifications: notifications.length, jobs: jobs.length, workerId });
}

async function main() {
  await cycle();
  if (process.env.JOB_WORKER_ONCE === "1") return;
  setInterval(() => void cycle().catch((error) => log.exception(error, { workerId })), 5_000);
}

main().catch((error) => {
  log.exception(error, { workerId });
  process.exitCode = 1;
});
