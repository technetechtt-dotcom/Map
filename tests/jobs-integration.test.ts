import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { dispatchJob, handleAnalyticsAggregation, handleDataImport, handleDuplicateDetection, handleReportGeneration, handleBackup } from "@/lib/jobs/handlers";
import { applyImportBatch, importRowHash } from "@/lib/import-apply";

const integration = process.env.POSTGRES_INTEGRATION === "1" ? describe : describe.skip;
const prefix = `jobtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

integration("background job handlers", () => {
  afterAll(async () => {
    await prisma.location.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.importBatch.deleteMany({ where: { source: prefix } });
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
});
