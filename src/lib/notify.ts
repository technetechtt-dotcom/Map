/** Durable notification queue. Delivery is performed by `npm run jobs:worker`. */
import { prisma } from "./prisma";
import { log } from "./logger";
import type { Prisma } from "@prisma/client";

export type NotifyEvent = {
  type: string;
  to?: string;
  userId?: string;
  subject: string;
  body: string;
  meta?: Record<string, unknown>;
};

export async function notify(event: NotifyEvent): Promise<void> {
  try {
    if (event.userId) {
      const preference = await prisma.notificationPreference.findUnique({
        where: { userId_eventType: { userId: event.userId, eventType: event.type } },
        select: { email: true, inApp: true },
      });
      // A disabled email preference should not create an email delivery job.
      // Keep in-app events queued when that channel is enabled so the event
      // remains visible in the account activity stream.
      if (preference && !preference.email && !preference.inApp) return;
      if (preference && !preference.email) event = { ...event, to: undefined };
    }
    await prisma.notification.create({
      data: {
        type: event.type,
        email: event.to,
        userId: event.userId,
        subject: event.subject,
        body: event.body,
        metadataJson: event.meta as Prisma.InputJsonValue | undefined,
      },
    });
    log.info("notify.queued", { type: event.type, to: event.to ? "[redacted]" : undefined });
  } catch (error) {
    log.error("notify.enqueue_failed", {
      type: event.type,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deliverNotification(id: string): Promise<void> {
  // Conditional claim makes delivery at-most-once per attempt when multiple
  // workers poll the same durable queue concurrently.
  const claimed = await prisma.notification.updateMany({
    where: { id, status: "PENDING", scheduledAt: { lte: new Date() }, attempts: { lt: 5 } },
    data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count !== 1) return;
  const event = await prisma.notification.findUnique({ where: { id } });
  if (!event) return;
  try {
    if (!event.email) {
      await prisma.notification.update({
        where: { id },
        data: { status: "COMPLETED", sentAt: new Date() },
      });
      return;
    }
    const webhook = process.env.NOTIFY_WEBHOOK_URL;
    if (!webhook) throw new Error("No notification delivery adapter configured");
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NOTIFY_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        type: event.type,
        to: event.email,
        subject: event.subject,
        body: event.body,
        meta: event.metadataJson || {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Notification adapter returned ${response.status}`);
    await prisma.notification.update({
      where: { id },
      data: { status: "COMPLETED", sentAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.notification.update({
      where: { id },
      data: {
        status: event.attempts + 1 >= 5 ? "FAILED" : "PENDING",
        lastError: message.slice(0, 2000),
        scheduledAt: new Date(Date.now() + Math.min(60, 2 ** event.attempts) * 60_000),
      },
    });
    throw error;
  }
}
