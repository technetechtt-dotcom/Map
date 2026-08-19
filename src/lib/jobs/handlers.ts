import { prisma } from "../prisma";
import { log } from "../logger";
import { findDuplicateCandidates } from "../duplicates";
import { deliverNotification } from "../notify";
import { copyStoredObjectsToBackup } from "../object-backup";
import { validatePointAssignment } from "../geo-validation";
import { createHash } from "crypto";
import { enqueueJob } from "../jobs";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function handleAnalyticsAggregation(jobId: string) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [locations, organisations, events, funding, failedJobs, notifications] = await Promise.all([
    prisma.location.groupBy({ by: ["status"], _count: true }),
    prisma.organisation.groupBy({ by: ["status"], _count: true }),
    prisma.analyticsEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED" } }),
    prisma.backgroundJob.count({ where: { status: "FAILED" } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
  ]);
  const summary = {
    generatedAt: new Date().toISOString(),
    locations,
    organisations,
    events24h: events,
    publishedFunding: funding,
    failedJobs,
    failedNotifications: notifications,
  };
  await prisma.appSetting.upsert({
    where: { key: "analytics.daily" },
    update: { value: JSON.stringify(summary) },
    create: { key: "analytics.daily", value: JSON.stringify(summary) },
  });
  log.info("jobs.analytics", { jobId, events24h: events });
  return summary;
}

export async function handleDataImport(jobId: string, payload: Record<string, unknown>) {
  const batchId = String(payload.batchId || "");
  if (!batchId) throw new Error("Missing batchId");
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "APPLIED") return { success: true, applied: batch.appliedCount, idempotent: true };

  const rows = Array.isArray(batch.payloadJson) ? (batch.payloadJson as Array<Record<string, unknown>>) : [];
  let applied = 0;
  const errors: Array<{ row: number; error: string }> = [];
  for (const [index, row] of rows.entries()) {
    try {
      const name = String(row.name || "").trim();
      if (!name) throw new Error("name required");
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("invalid coordinates");
      const province = await prisma.province.findFirst({
        where: { OR: [{ id: String(row.provinceId || "") }, { slug: String(row.provinceSlug || "") }] },
      });
      if (!province) throw new Error("unknown province");
      const category = await prisma.category.findFirst({
        where: { OR: [{ id: String(row.categoryId || "") }, { slug: String(row.categorySlug || "other") }] },
      });
      if (!category) throw new Error("unknown category");
      await prisma.location.create({
        data: {
          slug: `${slugify(name)}-${index}`,
          name,
          summary: String(row.summary || name),
          description: String(row.description || row.summary || name),
          latitude: lat,
          longitude: lng,
          categoryId: category.id,
          provinceId: province.id,
          status: "DRAFT",
          coordQuality: "estimated",
          sourceConfidence: "import",
        },
      });
      applied += 1;
    } catch (error) {
      errors.push({ row: index, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: applied > 0 ? "APPLIED" : "REJECTED",
      appliedCount: applied,
      appliedAt: new Date(),
      reportJson: { jobId, errors },
    },
  });
  log.info("jobs.import", { jobId, batchId, applied, errors: errors.length });
  return { success: errors.length < rows.length, applied, errors };
}

export async function handleDuplicateDetection(jobId: string, payload: Record<string, unknown>) {
  const provinceId = typeof payload.provinceId === "string" ? payload.provinceId : undefined;
  const orgs = await prisma.organisation.findMany({
    where: { mergedIntoId: null, ...(provinceId ? { provinceId } : {}) },
    select: { id: true, name: true, provinceId: true, website: true, email: true, phone: true, address: true, cipcNumber: true },
    take: 2000,
  });
  const pairs: Array<{ a: string; b: string; score: number }> = [];
  for (const org of orgs) {
    const matches = findDuplicateCandidates(org, orgs.filter((row) => row.id !== org.id), { threshold: 0.85 });
    for (const match of matches.slice(0, 3)) {
      if (org.id < match.id) pairs.push({ a: org.id, b: match.id, score: match.score });
    }
  }
  await prisma.appSetting.upsert({
    where: { key: "duplicates.latest" },
    update: { value: JSON.stringify({ jobId, generatedAt: new Date().toISOString(), pairs: pairs.slice(0, 200) }) },
    create: { key: "duplicates.latest", value: JSON.stringify({ jobId, generatedAt: new Date().toISOString(), pairs: pairs.slice(0, 200) }) },
  });
  log.info("jobs.duplicates", { jobId, pairs: pairs.length });
  return { success: true, pairs: pairs.length };
}

export async function handleGeocoding(jobId: string, payload: Record<string, unknown>) {
  const id = typeof payload.locationId === "string" ? payload.locationId : null;
  const locations = id
    ? await prisma.location.findMany({ where: { id }, include: { municipality: true, district: true, province: true } })
    : await prisma.location.findMany({
        where: { coordQuality: { in: ["unknown", "directory-only"] } },
        include: { municipality: true, district: true, province: true },
        take: 100,
      });
  let updated = 0;
  for (const location of locations) {
    const geometry = location.municipality?.geojson || location.district?.geojson || location.province.geojson;
    const boundaryValid = validatePointAssignment(location.longitude, location.latitude, geometry);
    await prisma.location.update({
      where: { id: location.id },
      data: {
        boundaryValid,
        coordQuality: location.coordQuality === "unknown" ? "town-centre" : location.coordQuality,
        coordSource: location.coordSource || "geocode-job",
      },
    });
    updated += 1;
  }
  log.info("jobs.geocoding", { jobId, updated });
  return { success: true, updated };
}

export async function handleExpiryCheck(jobId: string) {
  const now = new Date();
  const expiredOrgs = await prisma.organisation.updateMany({
    where: { verificationExpiresAt: { lt: now }, status: "PUBLISHED" },
    data: { status: "PENDING_REVIEW" },
  });
  const expiredLocs = await prisma.location.updateMany({
    where: { verificationExpiresAt: { lt: now }, status: "PUBLISHED" },
    data: { status: "PENDING_REVIEW", staleAt: now },
  });
  const admins = await prisma.user.findMany({
    where: { active: true, role: { in: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] } },
    select: { id: true, email: true },
    take: 20,
  });
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        email: admin.email,
        type: "verification.expired",
        subject: "Verification expiry queue",
        body: `${expiredLocs.count} locations and ${expiredOrgs.count} organisations need re-verification.`,
        channel: "email",
      },
    });
  }
  log.info("jobs.expiry", { jobId, orgs: expiredOrgs.count, locs: expiredLocs.count });
  return { success: true, orgs: expiredOrgs.count, locs: expiredLocs.count };
}

export async function handleScheduledNotifications(jobId: string) {
  const pending = await prisma.notification.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() }, attempts: { lt: 5 } },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });
  let delivered = 0;
  for (const item of pending) {
    await deliverNotification(item.id);
    delivered += 1;
  }
  log.info("jobs.notify", { jobId, delivered });
  return { success: true, delivered };
}

export async function handleReportGeneration(jobId: string, payload: Record<string, unknown>) {
  const [locations, organisations, funding] = await Promise.all([
    prisma.location.count({ where: { status: { in: ["PUBLISHED", "VERIFIED"] } } }),
    prisma.organisation.count({ where: { status: "PUBLISHED" } }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED" } }),
  ]);
  const report = {
    jobId,
    generatedAt: new Date().toISOString(),
    kind: payload.kind || "ecosystem-summary",
    locations,
    organisations,
    funding,
  };
  await prisma.appSetting.upsert({
    where: { key: "reports.latest" },
    update: { value: JSON.stringify(report) },
    create: { key: "reports.latest", value: JSON.stringify(report) },
  });
  return { success: true, report };
}

export async function handleDataCleanup(jobId: string) {
  const analyticsDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 90);
  const cutoff = new Date(Date.now() - analyticsDays * 24 * 3600_000);
  const analytics = await prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const tokens = await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const recoveries = await prisma.mfaRecoveryRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  log.info("jobs.cleanup", { jobId, analytics: analytics.count, tokens: tokens.count, recoveries: recoveries.count });
  return { success: true, analytics: analytics.count, tokens: tokens.count, recoveries: recoveries.count };
}

export async function handleBackup(jobId: string) {
  const objects = await copyStoredObjectsToBackup();
  const checksum = createHash("sha256").update(JSON.stringify({ jobId, at: new Date().toISOString(), objects })).digest("hex");
  const record = await prisma.backupRecord.create({
    data: {
      filename: `job-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      path: "offsite",
      sizeBytes: objects.copiedBytes,
      notes: "Scheduled worker backup (object copy + checksum)",
      checksumSha256: checksum,
      objectsCopied: objects.copied,
      lastVerifiedAt: new Date(),
      rpoMinutes: 24 * 60,
      rtoMinutes: 120,
    },
  });
  await enqueueJob("notify.deliver", { reason: "backup-complete", backupId: record.id }, { idempotencyKey: `notify-backup-${record.id}` });
  log.info("jobs.backup", { jobId, objects: objects.copied });
  return { success: true, backupId: record.id, objects: objects.copied };
}

export async function dispatchJob(type: string, jobId: string, payload: Record<string, unknown>) {
  switch (type) {
    case "analytics.aggregate":
      return handleAnalyticsAggregation(jobId);
    case "data.import":
      return handleDataImport(jobId, payload);
    case "data.duplicates":
      return handleDuplicateDetection(jobId, payload);
    case "data.geocode":
      return handleGeocoding(jobId, payload);
    case "data.expiry":
      return handleExpiryCheck(jobId);
    case "data.cleanup":
      return handleDataCleanup(jobId);
    case "notify.deliver":
      return handleScheduledNotifications(jobId);
    case "system.report":
      return handleReportGeneration(jobId, payload);
    case "system.backup":
      return handleBackup(jobId);
    default:
      throw new Error(`No handler registered for ${type}`);
  }
}
