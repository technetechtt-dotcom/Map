import { prisma } from "./prisma";
import type { AuthUser } from "./policy";

export async function writeAudit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  provinceId?: string | null;
  organisationId?: string | null;
  user?: AuthUser | null;
}) {
  const provinceId =
    params.provinceId ?? params.user?.provinceId ?? null;
  const organisationId =
    params.organisationId ?? params.user?.organisationId ?? null;

  // Append-only: never update/delete via application code
  await prisma.auditLog.create({
    data: {
      userId: params.userId || params.user?.id || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      metadataJson: params.metadata ? (params.metadata as object) : undefined,
      ipAddress: params.ipAddress || null,
      provinceId,
      organisationId,
    },
  });
}

/**
 * Sampled analytics to limit DB growth. Override with ANALYTICS_SAMPLE_RATE=1.0.
 */
export async function trackEvent(params: {
  eventType: string;
  path?: string;
  provinceId?: string;
  locationId?: string;
  metadata?: unknown;
}) {
  const rate = Number(process.env.ANALYTICS_SAMPLE_RATE ?? "0.25");
  if (rate <= 0) return;
  if (rate < 1 && Math.random() > rate) return;

  // Skip obvious bot user-agents when provided in metadata
  const meta = params.metadata as { ua?: string } | undefined;
  if (meta?.ua && /bot|crawler|spider|slurp/i.test(meta.ua)) return;

  await prisma.analyticsEvent.create({
    data: {
      eventType: params.eventType,
      path: params.path,
      provinceId: params.provinceId,
      locationId: params.locationId,
      metadataJson: params.metadata ? (params.metadata as object) : undefined,
    },
  });
}

/** Retention: delete analytics older than N days (call from cron). */
export async function pruneAnalytics(retentionDays = 90) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
  return prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

/**
 * Audit rows are append-only and must not be deleted by the application.
 * Return the archival population so an off-site export job can retain it.
 */
export async function pruneAuditLogs(retentionDays = 365) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
  const count = await prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
  return { count, cutoff, archiveRequired: count > 0 };
}
