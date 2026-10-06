import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { writeAudit } from "@/lib/audit";

/**
 * Public and Ops ingest endpoint for system alerts (e.g. GitHub Actions backup failure,
 * monitoring webhooks, external alert triggers).
 * Returns HTTP 200 JSON { ok: true } on valid ingest.
 */
export async function POST(req: NextRequest) {
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

export async function GET() {
  return NextResponse.json(
    { ok: true, status: "listening", endpoint: "/api/admin/ops/alerts" },
    { status: 200 }
  );
}
