import { NextRequest, NextResponse } from "next/server";
import { GET as listLocations } from "../../locations/route";
import { authenticateApiKey } from "@/lib/api-key";
import { rateLimitAsync } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supplied = req.headers.has("x-api-key") || /^Bearer\s+ict_live_/i.test(req.headers.get("authorization") || "");
  const apiKey = supplied ? await authenticateApiKey(req, "locations:read") : null;
  if (supplied && !apiKey) return NextResponse.json({ error: "Invalid API key or scope" }, { status: 401 });
  if (process.env.PUBLIC_API_REQUIRE_KEY === "1" && !apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });
  if (apiKey) {
    const limited = await rateLimitAsync(`api-key:${apiKey.id}`, { limit: apiKey.rateLimit, windowMs: 60 * 60_000 });
    if (!limited.ok) return NextResponse.json({ error: "API quota exceeded", retryAfterSec: limited.retryAfterSec }, { status: 429 });
  }
  return listLocations(req);
}
