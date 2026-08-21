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

export function snapshotSettingKey(
  kind: "analytics.daily" | "duplicates.latest" | "reports.latest",
  provinceId?: string | null
) {
  return `${kind}:${provinceId || "national"}`;
}

export async function pendingJobCount() {
  return prisma.backgroundJob.count({
    where: { deadLetter: false, status: "PENDING", runAfter: { lte: new Date() } },
  });
}

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

export async function settleClaimedJob(
  job: { id: string; attempts: number; maxAttempts: number },
  error?: unknown
) {
  if (!error) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lockedBy: null, leaseExpiresAt: null },
    });
    return { deadLetter: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  const terminal = job.attempts >= job.maxAttempts;
  await prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: terminal ? "FAILED" : "PENDING",
      deadLetter: terminal,
      lastError: message.slice(0, 2000),
      runAfter: new Date(Date.now() + Math.min(60, 2 ** Math.max(0, job.attempts - 1)) * 60_000),
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
    },
  });
  return { deadLetter: terminal };
}

export async function listDeadLetters(limit = 50) {
  return prisma.backgroundJob.findMany({
    where: { deadLetter: true },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
    select: { id: true, type: true, attempts: true, maxAttempts: true, lastError: true, updatedAt: true, createdAt: true },
  });
}

export async function requeueDeadLetter(id: string) {
  const result = await prisma.backgroundJob.updateMany({
    where: { id, deadLetter: true },
    data: {
      deadLetter: false,
      status: "PENDING",
      attempts: 0,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      runAfter: new Date(),
    },
  });
  if (result.count !== 1) throw new Error("Dead-letter job not found");
  return prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
}

export async function requeueDeadLetters(type?: string) {
  const where = { deadLetter: true, ...(type ? { type } : {}) };
  const result = await prisma.backgroundJob.updateMany({
    where,
    data: {
      deadLetter: false,
      status: "PENDING",
      attempts: 0,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      runAfter: new Date(),
    },
  });
  return result.count;
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
