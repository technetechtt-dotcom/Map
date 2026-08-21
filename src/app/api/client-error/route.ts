import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { readJsonLimited, clientIdentity } from "@/lib/security";
import { rateLimitAsync } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await rateLimitAsync(`client-error:${clientIdentity(req)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) return new NextResponse(null, { status: 204 });

  const parsed = await readJsonLimited(req, 16 * 1024);
  if (!parsed.ok) return new NextResponse(null, { status: 204 });
  const body = parsed.data as Record<string, unknown>;
  const message = String(body.message || "client error").slice(0, 500);
  log.exception(new Error(message), {
    type: String(body.type || "client.error").slice(0, 80),
    url: String(body.url || "").slice(0, 500),
    stack: String(body.stack || "").slice(0, 2000),
    release: String(body.release || "").slice(0, 80),
  });
  return new NextResponse(null, { status: 204 });
}
