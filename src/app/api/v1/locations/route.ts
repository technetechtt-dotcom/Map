import { NextRequest, NextResponse } from "next/server";
import { GET as listLocations } from "../../locations/route";
import { authenticateApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supplied = req.headers.has("x-api-key") || /^Bearer\s+ict_live_/i.test(req.headers.get("authorization") || "");
  const auth = supplied ? await authenticateApiKey(req, "locations:read") : null;
  if (supplied && auth && !auth.ok) {
    return NextResponse.json(
      { error: auth.error, retryAfterSec: auth.status === 429 ? auth.retryAfterSec : undefined },
      { status: auth.status }
    );
  }
  if (supplied && (!auth || !auth.ok)) return NextResponse.json({ error: "Invalid API key or scope" }, { status: 401 });
  if (process.env.PUBLIC_API_REQUIRE_KEY === "1" && (!auth || !auth.ok)) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }
  return listLocations(req);
}
