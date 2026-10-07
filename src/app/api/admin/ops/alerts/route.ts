import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { log } from "@/lib/logger";
import { writeAudit } from "@/lib/audit";
import { authorizeAlertRequest } from "@/lib/ops-auth";

/**
 * Authenticated ingest for system alerts (GitHub Actions backup failure, monitoring).
 * Requires CRON_SECRET (x-cron-secret / Bearer) or METRICS_TOKEN (x-metrics-token / Bearer).
 */
export async function POST(req: NextRequest) {
  const auth = authorizeAlertRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const body = await req.json().catch(() => ({}));
    const type = typeof body?.type === "string" ? body.type : "alert.generic";
    const subject = typeof body?.subject === "string" ? body.subject : "Ops Alert";
    const alertBody = typeof body?.body === "string" ? body.body : "";
    const meta = typeof body?.meta === "object" && body?.meta !== null ? body.meta : {};

    log.warn(`ops.alert.${type}`, { subject, alertBody, meta });

    try {
      await writeAudit({
        action: `OPS_ALERT_${type.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}`,
        entityType: "SystemAlert",
        entityId: type,
        metadata: { subject, body: alertBody, ...meta },
      });
    } catch {
      // Avoid failing alert endpoint if database audit record creation is unavailable
    }

    return NextResponse.json(
      { ok: true, received: true, type, subject, ts: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error) {
    log.error("ops.alert.ingest_error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, error: "Failed to process alert" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = authorizeAlertRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  return NextResponse.json(
    { ok: true, status: "listening", endpoint: "/api/admin/ops/alerts" },
    { status: 200 }
  );
}
