import { collectMetrics } from "@/lib/metrics";
import { authorizeMetricsRequest } from "@/lib/ops-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Public: { status } only.
 * Authenticated metrics token: readiness details for monitoring.
 */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const privileged = authorizeMetricsRequest(req).ok;
  const maintenance = process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";

  if (!privileged) {
    let status: "ok" | "degraded" | "maintenance" = maintenance ? "maintenance" : "ok";
    if (!maintenance) {
      try {
        await collectMetrics();
      } catch {
        status = "degraded";
      }
    }
    return NextResponse.json({ status }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  let db: "ok" | "error" = "ok";
  let redis: "ok" | "skipped" | "error" = "skipped";
  let metrics: Awaited<ReturnType<typeof collectMetrics>> | null = null;
  try {
    metrics = await collectMetrics();
  } catch {
    db = "error";
  }

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
        signal: AbortSignal.timeout(2500),
      });
      redis = res.ok ? "ok" : "error";
    } catch {
      redis = "error";
    }
  }

  const backupStale = Boolean(metrics?.backup.stale);
  const status =
    db === "ok" && redis !== "error" && !maintenance ? (backupStale ? "degraded" : "ok") : maintenance ? "maintenance" : "degraded";

  return NextResponse.json(
    {
      status,
      db,
      dbLatencyMs: metrics?.dbLatencyMs ?? null,
      redis,
      storage: {
        driver: process.env.STORAGE_DRIVER || "local",
        configured: process.env.STORAGE_DRIVER === "s3" ? Boolean(process.env.S3_BUCKET) : true,
      },
      queue: metrics?.queue ?? null,
      backup: metrics?.backup ?? null,
      worker: metrics?.worker ?? null,
      verification: metrics?.verification ?? null,
      maintenance,
      version: process.env.npm_package_version || "1.3.0",
      uptimeSec: Math.floor(process.uptime()),
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
      alerts: {
        backupStale,
        workerUnhealthy: metrics ? metrics.worker.healthy === false : true,
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
