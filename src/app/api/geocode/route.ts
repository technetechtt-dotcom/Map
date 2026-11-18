import { NextRequest } from "next/server";
import { enforceRateLimitAsync, jsonError, jsonOk } from "@/lib/api";
import { geocodeAddress, geocoderDisabled, geocoderReady } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "geocode-search", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const query = (req.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 3 || query.length > 200) {
    return jsonError("Enter an address between 3 and 200 characters", 400);
  }

  if (geocoderDisabled()) {
    return jsonError("Address search is disabled in this environment", 503);
  }
  if (!geocoderReady()) {
    return jsonError("Address search is not configured", 503);
  }

  const result = await geocodeAddress(query);
  if (!result) return jsonError("No South African address match found", 404);
  return jsonOk({ result });
}
