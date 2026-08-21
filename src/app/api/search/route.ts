import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";
import { parseJsonArray } from "@/lib/shape";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "search", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return jsonError("q must contain at least 2 characters", 400);
  const locale = (req.nextUrl.searchParams.get("locale") || "en").slice(0, 8);
  const province = req.nextUrl.searchParams.get("province") || "";
  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || 20);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50) : 20;

  const stored = await prisma.searchSynonym.findMany({
    where: { locale: { in: [locale, "en"] } },
  });
  const synonyms = stored
    .filter((row) => q.toLowerCase().includes(row.term.toLowerCase()))
    .flatMap((row) => parseJsonArray(row.synonymsJson));
  const expanded = [q, ...synonyms].map((term) => `(${term})`).join(" OR ");

  const results = await prisma.$queryRaw<
    { kind: string; id: string; slug: string; title: string; summary: string | null; rank: number; headline: string }[]
  >`
    WITH search AS (SELECT websearch_to_tsquery('simple', ${expanded}) AS query)
    SELECT * FROM (
      SELECT 'location'::text kind, id, slug, name title, summary,
        (
          1.6 * ts_rank_cd(to_tsvector('simple', coalesce(name,'')), search.query) +
          1.1 * ts_rank_cd(to_tsvector('simple', coalesce(summary,'') || ' ' || coalesce(description,'')), search.query) +
          similarity(name, ${q})
        )::float8 rank,
        ts_headline('simple', coalesce(summary, name), search.query, 'MaxWords=18,MinWords=8') AS headline
      FROM "Location", search
      WHERE status IN ('PUBLISHED','VERIFIED')
        AND (${province} = '' OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR name % ${q})
      UNION ALL
      SELECT 'organisation', id, slug, name, description,
        (ts_rank_cd(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(type,'')), search.query) + similarity(name, ${q}))::float8,
        ts_headline('simple', coalesce(description, name), search.query, 'MaxWords=18,MinWords=8')
      FROM "Organisation", search
      WHERE status = 'PUBLISHED' AND "mergedIntoId" IS NULL
        AND (${province} = '' OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(type,'')) @@ search.query OR name % ${q})
      UNION ALL
      SELECT 'funding', id, slug, title, summary,
        (ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query) + CASE WHEN deadline IS NOT NULL AND deadline > NOW() THEN 0.15 ELSE 0 END)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8')
      FROM "FundingCall", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
      UNION ALL
      SELECT 'procurement', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8')
      FROM "Procurement", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
      UNION ALL
      SELECT 'event', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8')
      FROM "EcosystemEvent", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
      UNION ALL
      SELECT 'programme', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8')
      FROM "Programme", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query
    ) ranked
    ORDER BY rank DESC, title ASC
    LIMIT ${limit}
  `;
  return jsonOk({ query: q, expandedWith: synonyms, suggestions: synonyms.slice(0, 8), results });
}
