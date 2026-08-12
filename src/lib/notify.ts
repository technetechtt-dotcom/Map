/**
 * Best-effort notifications (email/webhook). Never throws into request path.
 */

import { log } from "./logger";

export type NotifyEvent = {
  type: string;
  to?: string;
  subject: string;
  body: string;
  meta?: Record<string, unknown>;
};

export async function notify(event: NotifyEvent): Promise<void> {
  try {
    log.info("notify", {
      type: event.type,
      to: event.to ? "[redacted]" : undefined,
      subject: event.subject,
    });

    const webhook = process.env.NOTIFY_WEBHOOK_URL;
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.NOTIFY_WEBHOOK_TOKEN
            ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          type: event.type,
          to: event.to,
          subject: event.subject,
          body: event.body,
          meta: event.meta || {},
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined);
    }

    const smtp = process.env.SMTP_URL;
    if (smtp && event.to) {
      // Integration point: nodemailer / SES. Logged until SMTP adapter is wired.
      log.info("notify.email_queued", { type: event.type });
    }
  } catch (e) {
    log.warn("notify.failed", { type: event.type, error: e instanceof Error ? e.message : "error" });
  }
}
