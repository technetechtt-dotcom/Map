import { notify } from "./notify";
import { log } from "./logger";
import { writeAudit } from "./audit";

export async function securityAlert(input: {
  type: string;
  subject: string;
  body: string;
  userId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}) {
  log.warn(`security.${input.type}`, input.metadata);
  await writeAudit({
    userId: input.userId,
    action: `SECURITY_${input.type.replace(/[^A-Z0-9_]/gi, "_").toUpperCase()}`,
    entityType: "Security",
    entityId: input.userId,
    metadata: input.metadata,
  });
  const ops = process.env.SECURITY_ALERT_EMAIL;
  if (ops) {
    await notify({
      type: `security.${input.type}`,
      to: ops,
      subject: input.subject,
      body: input.body,
      meta: input.metadata,
    });
  }
  if (input.email) {
    await notify({
      type: `security.${input.type}`,
      to: input.email,
      userId: input.userId,
      subject: input.subject,
      body: input.body,
      meta: input.metadata,
    });
  }
}
