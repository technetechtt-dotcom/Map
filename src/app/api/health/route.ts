import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight liveness/readiness probe (no auth, no PII).
 * DB check is best-effort — failure returns degraded status without 5xx so load balancers
 * can still separate process-alive vs data-alive via the `db` field.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }

  const maintenance =
    process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";

  const body = {
    status: db === "ok" && !maintenance ? "ok" : maintenance ? "maintenance" : "degraded",
    db,
    maintenance,
    version: process.env.npm_package_version || "1.1.0",
    uptimeSec: Math.floor(process.uptime()),
    latencyMs: Date.now() - started,
    ts: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
