import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Liveness/readiness probe (no auth, no PII).
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "error" = "ok";
  let redis: "ok" | "skipped" | "error" = "skipped";
  try {
    await prisma.$queryRaw`SELECT 1`;
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

  const maintenance =
    process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";

  const body = {
    status: db === "ok" && redis !== "error" && !maintenance ? "ok" : maintenance ? "maintenance" : "degraded",
    db,
    redis,
    storage: process.env.STORAGE_DRIVER || "local",
    maintenance,
    version: process.env.npm_package_version || "1.2.0",
    uptimeSec: Math.floor(process.uptime()),
    latencyMs: Date.now() - started,
    ts: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
