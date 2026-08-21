import { prisma } from "../prisma";
import { log } from "../logger";
import { findDuplicatePairsSql } from "../duplicates-sql";
import { deliverNotification } from "../notify";
import { copyStoredObjectsToBackup } from "../object-backup";
import { validatePointAssignment } from "../geo-validation";
import { enqueueJob, snapshotSettingKey } from "../jobs";
import { applyImportBatch } from "../import-apply";
import { isCoordQuality } from "../coords";
import { geocodeAddress, geocoderDisabled } from "../geocode";

export async function handleAnalyticsAggregation(jobId: string, payload: Record<string, unknown> = {}) {
  const provinceId = typeof payload.provinceId === "string" ? payload.provinceId : undefined;
  const since = new Date(Date.now() - 24 * 3600_000);
  const locationWhere = provinceId ? { provinceId } : {};
  const [locations, organisations, events, funding, failedJobs, notifications] = await Promise.all([
    prisma.location.groupBy({ by: ["status"], _count: true, where: locationWhere }),
    prisma.organisation.groupBy({ by: ["status"], _count: true, where: provinceId ? { provinceId } : {} }),
    prisma.analyticsEvent.count({ where: { createdAt: { gte: since }, ...(provinceId ? { provinceId } : {}) } }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED", ...(provinceId ? { provinceId } : {}) } }),
    prisma.backgroundJob.count({ where: { status: "FAILED" } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
  ]);
  const summary = {
    generatedAt: new Date().toISOString(),
    provinceId: provinceId || null,
    locations,
    organisations,
    events24h: events,
    publishedFunding: funding,
    failedJobs,
    failedNotifications: notifications,
  };
  const key = snapshotSettingKey("analytics.daily", provinceId);
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(summary) },
    create: { key, value: JSON.stringify(summary) },
  });
  log.info("jobs.analytics", { jobId, events24h: events });
  return summary;
}

export async function handleDataImport(jobId: string, payload: Record<string, unknown>) {
  const batchId = String(payload.batchId || "");
  if (!batchId) throw new Error("Missing batchId");
  const result = await applyImportBatch(batchId, {
    jobId,
    forceProvinceId: typeof payload.provinceId === "string" ? payload.provinceId : null,
  });
  log.info("jobs.import", { jobId, batchId, applied: result.applied, errors: result.errors.length, idempotent: result.idempotent });
  return result;
}

export async function handleDuplicateDetection(jobId: string, payload: Record<string, unknown>) {
  const provinceId = typeof payload.provinceId === "string" ? payload.provinceId : undefined;
  const pairs = await findDuplicatePairsSql({ provinceId, limit: 200, threshold: 0.4 });
  const key = snapshotSettingKey("duplicates.latest", provinceId);
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: JSON.stringify({ jobId, generatedAt: new Date().toISOString(), pairs }) },
    create: { key, value: JSON.stringify({ jobId, generatedAt: new Date().toISOString(), pairs }) },
  });
  log.info("jobs.duplicates", { jobId, pairs: pairs.length });
  return { success: true, pairs: pairs.length };
}

export async function handleGeocoding(jobId: string, payload: Record<string, unknown>) {
  const id = typeof payload.locationId === "string" ? payload.locationId : null;
  const locations = id
    ? await prisma.location.findMany({ where: { id }, include: { municipality: true, district: true, province: true } })
    : await prisma.location.findMany({
        where: {
          coordQuality: { in: ["unknown", "town-centre", "directory-only"] },
          ...(typeof payload.provinceId === "string" ? { provinceId: payload.provinceId } : {}),
        },
        include: { municipality: true, district: true, province: true },
        take: 100,
      });
  let updated = 0;
  for (const location of locations) {
    let latitude = location.latitude;
    let longitude = location.longitude;
    let coordQuality = isCoordQuality(location.coordQuality) && location.coordQuality !== "unknown" ? location.coordQuality : "town-centre";
    let coordSource = location.coordSource || "geocode-job";
    if (location.address && !geocoderDisabled()) {
      const hit = await geocodeAddress(
        [location.address, location.municipality?.name, location.district?.name, location.province.name].filter(Boolean).join(", ")
      );
      if (hit) {
        latitude = hit.latitude;
        longitude = hit.longitude;
        coordQuality = "estimated";
        coordSource = hit.source;
      }
      if (!process.env.GEOCODER_API_KEY) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }
    const geometry = location.municipality?.geojson || location.district?.geojson || location.province.geojson;
    const boundaryValid = validatePointAssignment(longitude, latitude, geometry);
    await prisma.location.update({
      where: { id: location.id },
      data: {
        latitude,
        longitude,
        boundaryValid,
        coordQuality,
        coordSource,
      },
    });
    updated += 1;
  }
  log.info("jobs.geocoding", { jobId, updated });
  return { success: true, updated };
}

export async function handleExpiryCheck(jobId: string, payload: Record<string, unknown> = {}) {
  const now = new Date();
  const provinceId = typeof payload.provinceId === "string" ? payload.provinceId : undefined;
  const expiredOrgs = await prisma.organisation.updateMany({
    where: { verificationExpiresAt: { lt: now }, status: "PUBLISHED", ...(provinceId ? { provinceId } : {}) },
    data: { status: "PENDING_REVIEW" },
  });
  const expiredLocs = await prisma.location.updateMany({
    where: { verificationExpiresAt: { lt: now }, status: "PUBLISHED", ...(provinceId ? { provinceId } : {}) },
    data: { status: "PENDING_REVIEW", staleAt: now },
  });
  const admins = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["SUPER_ADMIN", "PROVINCIAL_ADMIN"] },
      ...(provinceId ? { OR: [{ role: "SUPER_ADMIN" }, { provinceId }] } : {}),
    },
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
    prisma.location.count({ where: { status: { in: ["PUBLISHED", "VERIFIED"] }, ...(typeof payload.provinceId === "string" ? { provinceId: payload.provinceId } : {}) } }),
    prisma.organisation.count({ where: { status: "PUBLISHED", ...(typeof payload.provinceId === "string" ? { provinceId: payload.provinceId } : {}) } }),
    prisma.fundingCall.count({ where: { status: "PUBLISHED", ...(typeof payload.provinceId === "string" ? { provinceId: payload.provinceId } : {}) } }),
  ]);
  const report = {
    jobId,
    generatedAt: new Date().toISOString(),
    kind: payload.kind || "ecosystem-summary",
    locations,
    organisations,
    funding,
  };
  const key = snapshotSettingKey("reports.latest", typeof payload.provinceId === "string" ? payload.provinceId : null);
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(report) },
    create: { key, value: JSON.stringify(report) },
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
  if (objects.failed?.length) {
    throw new Error(`object backup incomplete: ${objects.failed.length} files failed copy or checksum verify`);
  }
  const record = await prisma.backupRecord.create({
    data: {
      filename: `job-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      path: "offsite",
      sizeBytes: objects.copiedBytes,
      notes: "Scheduled worker backup (object copy + byte checksum verify)",
      kind: "objects",
      checksumSha256: objects.checksumSha256,
      objectsCopied: objects.copied,
      lastVerifiedAt: new Date(),
      rpoMinutes: 24 * 60,
      rtoMinutes: 120,
    },
  });
  await enqueueJob("notify.deliver", { reason: "backup-complete", backupId: record.id }, { idempotencyKey: `notify-backup-${record.id}` });
  log.info("jobs.backup", { jobId, objects: objects.copied, verified: objects.verified });
  return { success: true, backupId: record.id, objects: objects.copied, verified: objects.verified };
}

export async function dispatchJob(type: string, jobId: string, payload: Record<string, unknown>) {
  switch (type) {
    case "analytics.aggregate":
      return handleAnalyticsAggregation(jobId, payload);
    case "data.import":
      return handleDataImport(jobId, payload);
    case "data.duplicates":
      return handleDuplicateDetection(jobId, payload);
    case "data.geocode":
      return handleGeocoding(jobId, payload);
    case "data.expiry":
      return handleExpiryCheck(jobId, payload);
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
