import { NextRequest } from "next/server";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";
import { searchCatalog } from "@/lib/search";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "search", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return jsonError("q must contain at least 2 characters", 400);
  const data = await searchCatalog({
    q,
    locale: req.nextUrl.searchParams.get("locale") || "en",
    province: req.nextUrl.searchParams.get("province") || "",
    type: req.nextUrl.searchParams.get("type") || "all",
    sort: req.nextUrl.searchParams.get("sort") || "relevance",
    page: Number(req.nextUrl.searchParams.get("page") || 1),
    limit: Number(req.nextUrl.searchParams.get("limit") || 20),
  });
  return jsonOk(data);
}
