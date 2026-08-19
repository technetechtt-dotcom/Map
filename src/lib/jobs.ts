import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export const JOB_TYPES = [
  "analytics.aggregate",
  "data.import",
  "data.duplicates",
  "data.geocode",
  "data.expiry",
  "data.cleanup",
  "notify.deliver",
  "system.report",
  "system.backup",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  options?: { runAfter?: Date; idempotencyKey?: string; maxRuntimeMs?: number }
) {
  try {
    return await prisma.backgroundJob.create({
      data: {
        type,
        payloadJson: payload as Prisma.InputJsonValue,
        runAfter: options?.runAfter || new Date(),
        idempotencyKey: options?.idempotencyKey,
        maxRuntimeMs: options?.maxRuntimeMs ?? 300_000,
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002" && options?.idempotencyKey) {
      return prisma.backgroundJob.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    }
    throw error;
  }
}

export async function recoverStaleJobs() {
  const now = new Date();
  const expired = await prisma.backgroundJob.updateMany({
    where: {
      status: "RUNNING",
      deadLetter: false,
      OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null, lockedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }],
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      lockedBy: null,
      lastError: "Lease expired; requeued",
    },
  });
  return expired.count;
}

export async function heartbeatJob(jobId: string, workerId: string, leaseMs = 60_000) {
  await prisma.backgroundJob.updateMany({
    where: { id: jobId, lockedBy: workerId, status: "RUNNING" },
    data: { heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + leaseMs) },
  });
}

export async function recordWorkerHeartbeat(workerId: string, queueDepth: number) {
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    update: { lastSeenAt: new Date(), queueDepth },
    create: { workerId, lastSeenAt: new Date(), queueDepth },
  });
}

export async function claimJobs(workerId: string, limit = 10) {
  await recoverStaleJobs();
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const jobs = await tx.backgroundJob.findMany({
      where: {
        deadLetter: false,
        OR: [
          { status: "PENDING", runAfter: { lte: now } },
          { status: "RUNNING", leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit * 2,
    });
    const validJobs = jobs
      .filter((job) => {
        if (job.status === "PENDING") return true;
        if (job.status === "RUNNING" && job.lockedAt) {
          const leaseExpired = job.leaseExpiresAt ? job.leaseExpiresAt.getTime() <= now.getTime() : now.getTime() - job.lockedAt.getTime() > job.maxRuntimeMs;
          return leaseExpired;
        }
        return false;
      })
      .slice(0, limit);
    if (!validJobs.length) return [];

    const claimedIds: string[] = [];
    for (const job of validJobs) {
      const leaseExpiresAt = new Date(now.getTime() + Math.max(60_000, job.maxRuntimeMs));
      const result = await tx.backgroundJob.updateMany({
        where: { id: job.id, status: job.status, lockedAt: job.lockedAt },
        data: {
          status: "RUNNING",
          lockedAt: now,
          lockedBy: workerId,
          heartbeatAt: now,
          leaseExpiresAt,
          attempts: { increment: 1 },
        },
      });
      if (result.count === 1) claimedIds.push(job.id);
    }
    return claimedIds.length
      ? tx.backgroundJob.findMany({ where: { id: { in: claimedIds }, lockedBy: workerId } })
      : [];
  });
}
