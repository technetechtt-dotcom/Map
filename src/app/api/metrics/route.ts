import { NextRequest, NextResponse } from "next/server";
import { collectMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.METRICS_TOKEN;
  const provided = req.headers.get("x-metrics-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (process.env.NODE_ENV === "production" && secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const metrics = await collectMetrics();
  return NextResponse.json(metrics, { headers: { "Cache-Control": "no-store" } });
}
