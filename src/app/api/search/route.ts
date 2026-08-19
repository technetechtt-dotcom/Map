import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";

const SYNONYMS: Record<string, string[]> = {
  hub: ["incubator", "innovation centre", "digital centre"],
  funding: ["grant", "finance", "investment"],
  training: ["skills", "course", "programme"],
  tender: ["procurement", "bid", "rfp"],
};

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "search", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return jsonError("q must contain at least 2 characters", 400);
  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 20;
  const synonyms = Object.entries(SYNONYMS)
    .filter(([term]) => q.toLowerCase().includes(term))
    .flatMap(([, values]) => values);
  const expanded = [q, ...synonyms].map((term) => `(${term})`).join(" OR ");

  const results = await prisma.$queryRaw<
    { kind: string; id: string; slug: string; title: string; summary: string | null; rank: number }[]
  >`
    WITH search AS (SELECT websearch_to_tsquery('simple', ${expanded}) AS query)
    SELECT * FROM (
      SELECT 'location'::text kind, id, slug, name title, summary,
        (ts_rank_cd(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')), search.query) + similarity(name, ${q}))::float8 rank
      FROM "Location", search WHERE status IN ('PUBLISHED','VERIFIED') AND (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR name % ${q})
      UNION ALL
      SELECT 'organisation', id, slug, name, description,
        (ts_rank_cd(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(type,'')), search.query) + similarity(name, ${q}))::float8
      FROM "Organisation", search WHERE status = 'PUBLISHED' AND (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(type,'')) @@ search.query OR name % ${q})
      UNION ALL
      SELECT 'funding', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')), search.query)::float8
      FROM "FundingCall", search WHERE status = 'PUBLISHED' AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
      UNION ALL
      SELECT 'procurement', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')), search.query)::float8
      FROM "Procurement", search WHERE status = 'PUBLISHED' AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
      UNION ALL
      SELECT 'event', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')), search.query)::float8
      FROM "EcosystemEvent", search WHERE status = 'PUBLISHED' AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
      UNION ALL
      SELECT 'programme', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')), search.query)::float8
      FROM "Programme", search WHERE status = 'PUBLISHED' AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
    ) ranked
    ORDER BY rank DESC, title ASC
    LIMIT ${limit}
  `;
  return jsonOk({ query: q, expandedWith: synonyms, results });
}
