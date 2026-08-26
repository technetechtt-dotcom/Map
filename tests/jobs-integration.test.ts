import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { dispatchJob, handleAnalyticsAggregation, handleDataImport, handleDuplicateDetection, handleReportGeneration, handleBackup } from "@/lib/jobs/handlers";
import { applyImportBatch, importRowHash } from "@/lib/import-apply";
import { claimJobs, enqueueJob, heartbeatJob, recoverStaleJobs, recordWorkerHeartbeat, requeueDeadLetter, settleClaimedJob } from "@/lib/jobs";
import { findDuplicatePairsSql } from "@/lib/duplicates-sql";
import { deliverNotification } from "@/lib/notify";
import { isWorkerHealthy } from "@/lib/metrics";

const integration = process.env.POSTGRES_INTEGRATION === "1" ? describe : describe.skip;
const prefix = `jobtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

integration("background job handlers", () => {
  afterAll(async () => {
    await prisma.location.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.importBatch.deleteMany({ where: { source: prefix } });
    await prisma.appSetting.deleteMany({ where: { key: { contains: prefix } } }).catch(() => undefined);
    await prisma.appSetting.deleteMany({ where: { key: { startsWith: "analytics.daily:" } } }).catch(() => undefined);
    await prisma.organisation.deleteMany({ where: { slug: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.backgroundJob.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { subject: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.storedObject.deleteMany({ where: { filename: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.workerHeartbeat.deleteMany({ where: { workerId: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("rejects unknown handlers and missing import batch ids", async () => {
    await expect(dispatchJob("not.a.job", "job-1", {})).rejects.toThrow(/No handler registered/);
    await expect(dispatchJob("data.import", `${prefix}-missing`, {})).rejects.toThrow(/Missing batchId/);
    await expect(dispatchJob("data.geocode", `${prefix}-geocode`, { locationId: `${prefix}-missing` })).resolves.toMatchObject({ updated: 0 });
    await expect(dispatchJob("notify.deliver", `${prefix}-notify`, {})).resolves.toMatchObject({ success: true });
  });

  it("runs analytics, reports, duplicates and backup handlers", async () => {
    await expect(handleAnalyticsAggregation(`${prefix}-analytics`)).resolves.toMatchObject({ events24h: expect.any(Number) });
    await expect(handleReportGeneration(`${prefix}-report`, { kind: "test" })).resolves.toMatchObject({ success: true });
    await expect(handleDuplicateDetection(`${prefix}-dupes`, {})).resolves.toMatchObject({ success: true });
    const backup = await handleBackup(`${prefix}-backup`);
    expect(backup.success).toBe(true);
    if ("backupId" in backup && backup.backupId) {
      await prisma.backgroundJob.deleteMany({ where: { idempotencyKey: `notify-backup-${backup.backupId}` } });
      await prisma.backupRecord.delete({ where: { id: backup.backupId } }).catch(() => undefined);
    }
  });

  it("applies imports idempotently by row hash", async () => {
    const province = await prisma.province.findFirst();
    const category = await prisma.category.findFirst();
    if (!province || !category) return;
    const row = {
      name: `${prefix} School`,
      summary: `${prefix} summary`,
      latitude: -28.7,
      longitude: 24.7,
      provinceId: province.id,
      categoryId: category.id,
    };
    const batch = await prisma.importBatch.create({
      data: {
        source: prefix,
        status: "STAGED",
        provinceId: province.id,
        rowCount: 1,
        payloadJson: [row],
        checksumSha256: importRowHash(row),
      },
    });
    const first = await applyImportBatch(batch.id, { jobId: `${prefix}-import-1` });
    const second = await handleDataImport(`${prefix}-import-2`, { batchId: batch.id });
    expect(first.applied).toBe(1);
    expect(second.idempotent || second.applied === first.applied).toBe(true);
    const locations = await prisma.location.findMany({ where: { name: row.name } });
    expect(locations).toHaveLength(1);
  });

  it("does not apply rows that failed staging validation", async () => {
    const province = await prisma.province.findFirst();
    const category = await prisma.category.findFirst();
    if (!province || !category) return;
    const bad = {
      name: `${prefix} OutOfRange`,
      summary: `${prefix} bad`,
      latitude: 999,
      longitude: 24.7,
      provinceId: province.id,
      categoryId: category.id,
    };
    const batch = await prisma.importBatch.create({
      data: {
        source: prefix,
        status: "STAGED",
        provinceId: province.id,
        rowCount: 1,
        payloadJson: [bad],
        reportJson: { rows: [{ index: 0, ok: false, issues: ["missing or out-of-range coordinates"] }] },
        checksumSha256: importRowHash(bad),
      },
    });
    const result = await applyImportBatch(batch.id, { jobId: `${prefix}-import-skip` });
    expect(result.applied).toBe(0);
    expect(await prisma.location.count({ where: { name: bad.name } })).toBe(0);
  });

  it("writes province-scoped analytics snapshots", async () => {
    const province = await prisma.province.findFirst();
    if (!province) return;
    await handleAnalyticsAggregation(`${prefix}-analytics-p`, { provinceId: province.id });
    const row = await prisma.appSetting.findUnique({ where: { key: `analytics.daily:${province.id}` } });
    expect(row?.value).toBeTruthy();
    await prisma.appSetting.delete({ where: { key: `analytics.daily:${province.id}` } }).catch(() => undefined);
  });

  it("applies only valid rows from a partial import batch", async () => {
    const province = await prisma.province.findFirst();
    const category = await prisma.category.findFirst();
    if (!province || !category) return;
    const good = {
      name: `${prefix} Partial Good`,
      summary: `${prefix} good`,
      latitude: -28.7,
      longitude: 24.7,
      provinceId: province.id,
      categoryId: category.id,
    };
    const bad = {
      name: `${prefix} Partial Bad`,
      summary: `${prefix} bad`,
      latitude: 999,
      longitude: 24.7,
      provinceId: province.id,
      categoryId: category.id,
    };
    const batch = await prisma.importBatch.create({
      data: {
        source: prefix,
        status: "STAGED",
        provinceId: province.id,
        rowCount: 2,
        payloadJson: [bad, good],
        reportJson: {
          rows: [
            { index: 0, ok: false, issues: ["missing or out-of-range coordinates"] },
            { index: 1, ok: true, issues: [] },
          ],
        },
        checksumSha256: importRowHash(good),
      },
    });
    const result = await applyImportBatch(batch.id, { jobId: `${prefix}-partial` });
    expect(result.applied).toBe(1);
    expect(await prisma.location.count({ where: { name: good.name } })).toBe(1);
    expect(await prisma.location.count({ where: { name: bad.name } })).toBe(0);
  });

  it("reclaims expired leases and dead-letters jobs at maxAttempts", async () => {
    const stale = await enqueueJob("data.cleanup", { prefix }, { idempotencyKey: `${prefix}-lease` });
    await prisma.backgroundJob.update({
      where: { id: stale!.id },
      data: {
        status: "RUNNING",
        lockedAt: new Date(Date.now() - 120_000),
        lockedBy: "dead-worker",
        leaseExpiresAt: new Date(Date.now() - 1_000),
        maxAttempts: 1,
        attempts: 0,
        createdAt: new Date(0),
        runAfter: new Date(0),
      },
    });
    expect(await recoverStaleJobs()).toBeGreaterThanOrEqual(1);
    const claimed = await claimJobs(`${prefix}-worker-lease`, 50);
    expect(claimed.some((job) => job.id === stale!.id)).toBe(true);
    const extras = claimed.filter((job) => job.id !== stale!.id).map((job) => job.id);
    if (extras.length) {
      await prisma.backgroundJob.updateMany({
        where: { id: { in: extras } },
        data: { status: "PENDING", lockedAt: null, lockedBy: null, leaseExpiresAt: null },
      });
    }
    expect(claimed.some((job) => job.id === stale!.id)).toBe(true);
    const leased = claimed.find((job) => job.id === stale!.id)!;
    await heartbeatJob(leased.id, `${prefix}-worker-lease`, 60_000);
    const beating = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: leased.id } });
    expect(beating.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    const settled = await settleClaimedJob({ id: leased.id, attempts: leased.attempts, maxAttempts: 1 }, new Error("forced fail"));
    expect(settled.deadLetter).toBe(true);
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: leased.id } });
    expect(row.deadLetter).toBe(true);
    expect(row.status).toBe("FAILED");
    const revived = await requeueDeadLetter(row.id);
    expect(revived.deadLetter).toBe(false);
    expect(revived.status).toBe("PENDING");
    expect(revived.attempts).toBe(0);
  });

  it("lets only one worker claim the same pending job", async () => {
    const job = await enqueueJob("data.cleanup", { prefix }, { idempotencyKey: `${prefix}-race` });
    await prisma.backgroundJob.update({
      where: { id: job!.id },
      data: { createdAt: new Date(0), runAfter: new Date(0) },
    });
    const [a, b] = await Promise.all([claimJobs(`${prefix}-w1`, 50), claimJobs(`${prefix}-w2`, 50)]);
    const hits = [...a, ...b].filter((row) => row.id === job!.id);
    expect(hits).toHaveLength(1);
    const extras = [...a, ...b].filter((row) => row.id !== job!.id).map((row) => row.id);
    if (extras.length) {
      await prisma.backgroundJob.updateMany({
        where: { id: { in: extras } },
        data: { status: "PENDING", lockedAt: null, lockedBy: null, leaseExpiresAt: null },
      });
    }
    await settleClaimedJob({ id: hits[0].id, attempts: hits[0].attempts, maxAttempts: hits[0].maxAttempts });
  });

  it("keeps analytics and duplicate snapshots isolated by province", async () => {
    const provinces = await prisma.province.findMany({ take: 2, orderBy: { code: "asc" } });
    if (provinces.length < 2) return;
    const [first, second] = provinces;
    await handleAnalyticsAggregation(`${prefix}-iso-a`, { provinceId: first.id });
    await handleAnalyticsAggregation(`${prefix}-iso-b`, { provinceId: second.id });
    const a = await prisma.appSetting.findUnique({ where: { key: `analytics.daily:${first.id}` } });
    const b = await prisma.appSetting.findUnique({ where: { key: `analytics.daily:${second.id}` } });
    expect(a?.value).toBeTruthy();
    expect(b?.value).toBeTruthy();
    expect(a!.value).not.toBe(b!.value);
    await handleDuplicateDetection(`${prefix}-dup-a`, { provinceId: first.id });
    await handleDuplicateDetection(`${prefix}-dup-b`, { provinceId: second.id });
    expect(await prisma.appSetting.findUnique({ where: { key: `duplicates.latest:${first.id}` } })).toBeTruthy();
    expect(await prisma.appSetting.findUnique({ where: { key: `duplicates.latest:${second.id}` } })).toBeTruthy();
    await prisma.appSetting.deleteMany({
      where: { key: { in: [`analytics.daily:${first.id}`, `analytics.daily:${second.id}`, `duplicates.latest:${first.id}`, `duplicates.latest:${second.id}`] } },
    });
  });

  it("limits duplicate candidates and keeps them inside the requested province", async () => {
    const provinces = await prisma.province.findMany({ take: 2, orderBy: { code: "asc" } });
    if (provinces.length < 2) return;
    const [first, second] = provinces;
    const email = `${prefix}-twins@example.test`;
    await prisma.organisation.createMany({
      data: [
        { slug: `${prefix}-t1`, name: `${prefix} Twin One`, type: "npo", email, provinceId: first.id },
        { slug: `${prefix}-t2`, name: `${prefix} Twin Two`, type: "npo", email, provinceId: first.id },
        { slug: `${prefix}-t3`, name: `${prefix} Twin Three`, type: "npo", email, provinceId: first.id },
        { slug: `${prefix}-x1`, name: `${prefix} Other Twin`, type: "npo", email: `${prefix}-other@example.test`, provinceId: second.id },
        { slug: `${prefix}-x2`, name: `${prefix} Other Twin 2`, type: "npo", email: `${prefix}-other@example.test`, provinceId: second.id },
      ],
    });
    const limited = await findDuplicatePairsSql({ provinceId: first.id, limit: 1, threshold: 0.1 });
    expect(limited.length).toBeLessThanOrEqual(1);
    const scoped = await findDuplicatePairsSql({ provinceId: first.id, limit: 20, threshold: 0.1 });
    const firstIds = new Set(
      (await prisma.organisation.findMany({ where: { slug: { startsWith: `${prefix}-t` } }, select: { id: true } })).map((row) => row.id)
    );
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((pair) => firstIds.has(pair.a) && firstIds.has(pair.b))).toBe(true);
  });

  it("retries notifications five times then marks them failed", async () => {
    const previous = process.env.NOTIFY_WEBHOOK_URL;
    process.env.NOTIFY_WEBHOOK_URL = "http://127.0.0.1:1/notify-fail";
    const item = await prisma.notification.create({
      data: {
        type: "test.retry",
        email: `${prefix}@example.test`,
        subject: `${prefix} retry`,
        body: "retry",
      },
    });
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await prisma.notification.update({ where: { id: item.id }, data: { scheduledAt: new Date() } });
        await expect(deliverNotification(item.id)).rejects.toThrow();
      }
      const failed = await prisma.notification.findUniqueOrThrow({ where: { id: item.id } });
      expect(failed.status).toBe("FAILED");
      expect(failed.attempts).toBe(5);
      await deliverNotification(item.id);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: item.id } })).attempts).toBe(5);
    } finally {
      if (previous === undefined) delete process.env.NOTIFY_WEBHOOK_URL;
      else process.env.NOTIFY_WEBHOOK_URL = previous;
    }
  });

  it("treats stale workers as unhealthy and fails object backup copies", async () => {
    expect(isWorkerHealthy(new Date(Date.now() - 10 * 60_000))).toBe(false);
    expect(isWorkerHealthy(new Date())).toBe(true);
    await recordWorkerHeartbeat(`${prefix}-stale`, 9);
    await prisma.workerHeartbeat.update({
      where: { workerId: `${prefix}-stale` },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) },
    });
    const stale = await prisma.workerHeartbeat.findUniqueOrThrow({ where: { workerId: `${prefix}-stale` } });
    expect(isWorkerHealthy(stale.lastSeenAt)).toBe(false);

    const stored = await prisma.storedObject.create({
      data: {
        filename: `${prefix}-file.bin`,
        url: "/tmp/missing",
        contentType: "application/octet-stream",
        sizeBytes: 4,
        sha256: "abcd",
      },
    });
    const env = {
      bucket: process.env.S3_BUCKET,
      backup: process.env.S3_BACKUP_BUCKET,
      key: process.env.S3_ACCESS_KEY_ID,
      secret: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
      attempts: process.env.AWS_MAX_ATTEMPTS,
    };
    process.env.S3_BUCKET = "ci-source-bucket";
    process.env.S3_BACKUP_BUCKET = "ci-backup-bucket";
    process.env.S3_ACCESS_KEY_ID = "ci-key";
    process.env.S3_SECRET_ACCESS_KEY = "ci-secret";
    process.env.S3_ENDPOINT = "http://127.0.0.1:1";
    process.env.AWS_MAX_ATTEMPTS = "1";
    try {
      await expect(handleBackup(`${prefix}-backup-fail`)).rejects.toThrow(/object backup (incomplete|FAILED|PARTIAL)/);
    } finally {
      if (env.bucket === undefined) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = env.bucket;
      if (env.backup === undefined) delete process.env.S3_BACKUP_BUCKET;
      else process.env.S3_BACKUP_BUCKET = env.backup;
      if (env.key === undefined) delete process.env.S3_ACCESS_KEY_ID;
      else process.env.S3_ACCESS_KEY_ID = env.key;
      if (env.secret === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
      else process.env.S3_SECRET_ACCESS_KEY = env.secret;
      if (env.endpoint === undefined) delete process.env.S3_ENDPOINT;
      else process.env.S3_ENDPOINT = env.endpoint;
      if (env.attempts === undefined) delete process.env.AWS_MAX_ATTEMPTS;
      else process.env.AWS_MAX_ATTEMPTS = env.attempts;
      await prisma.storedObject.delete({ where: { id: stored.id } }).catch(() => undefined);
    }
  });
});
