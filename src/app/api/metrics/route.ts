import { NextRequest, NextResponse } from "next/server";
import { collectMetrics } from "@/lib/metrics";
import { authorizeMetricsRequest } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authz = authorizeMetricsRequest(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const metrics = await collectMetrics();
  return NextResponse.json(metrics, { headers: { "Cache-Control": "no-store" } });
}
