import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";
import { deliverNotification } from "../src/lib/notify";
import { claimJobs, heartbeatJob, pendingJobCount, recordWorkerHeartbeat, settleClaimedJob } from "../src/lib/jobs";
import { dispatchJob } from "../src/lib/jobs/handlers";
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
  const queueDepth = await pendingJobCount();
  await recordWorkerHeartbeat(workerId, queueDepth);
  for (const job of jobs) {
    const beat = setInterval(() => {
      void heartbeatJob(job.id, workerId, Math.max(60_000, job.maxRuntimeMs));
    }, 20_000);
    try {
      const payload = job.payloadJson && typeof job.payloadJson === "object" ? (job.payloadJson as Record<string, unknown>) : {};
      const result = await dispatchJob(job.type, job.id, payload);
      log.info("worker.handled", { type: job.type, id: job.id, result });
      await settleClaimedJob(job);
    } catch (error) {
      await settleClaimedJob(job, error);
    } finally {
      clearInterval(beat);
    }
  }
  log.info("worker.cycle", { notifications: notifications.length, jobs: jobs.length, queueDepth, workerId });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (process.env.JOB_WORKER_ONCE === "1") {
    await cycle();
    return;
  }
  for (;;) {
    try {
      await cycle();
    } catch (error) {
      log.exception(error, { workerId });
    }
    await sleep(5_000);
  }
}

main().catch((error) => {
  log.exception(error, { workerId });
  process.exitCode = 1;
});
