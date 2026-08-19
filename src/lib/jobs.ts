import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export async function enqueueJob(type: string, payload: Record<string, unknown>, runAfter = new Date()) {
  return prisma.backgroundJob.create({
    data: { type, payloadJson: payload as Prisma.InputJsonValue, runAfter },
  });
}

export async function claimJobs(workerId: string, limit = 10) {
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.backgroundJob.findMany({
      where: { status: "PENDING", runAfter: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    if (!jobs.length) return [];

    // Claim each row with a conditional update.  Under concurrent workers a
    // second transaction may have selected the same pending row, but its
    // update affects zero rows and it will not process the job twice.
    const claimedIds: string[] = [];
    for (const job of jobs) {
      const result = await tx.backgroundJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: {
          status: "RUNNING",
          lockedAt: new Date(),
          lockedBy: workerId,
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
