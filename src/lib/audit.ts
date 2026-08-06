import { prisma } from "./prisma";

export async function writeAudit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
      ipAddress: params.ipAddress || null,
    },
  });
}

export async function trackEvent(params: {
  eventType: string;
  path?: string;
  provinceId?: string;
  locationId?: string;
  metadata?: unknown;
}) {
  await prisma.analyticsEvent.create({
    data: {
      eventType: params.eventType,
      path: params.path,
      provinceId: params.provinceId,
      locationId: params.locationId,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
