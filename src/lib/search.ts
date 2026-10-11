import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/shape";

export async function searchCatalog(input: {
  q: string;
  locale?: string;
  province?: string;
  type?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  const q = input.q.trim().slice(0, 100);
  const locale = (input.locale || "en").slice(0, 8);
  const province = input.province || "";
  const type = (input.type || "all").toLowerCase();
  const sort = input.sort || "relevance";
  const page = Math.max(1, input.page || 1);
  const limit = Math.min(Math.max(input.limit || 20, 1), 50);
  const offset = (page - 1) * limit;

  const stored = await prisma.searchSynonym.findMany({
    where: { locale: { in: [locale, "en"] } },
  });
  const synonyms = stored
    .filter((row) => q.toLowerCase().includes(row.term.toLowerCase()))
    .flatMap((row) => parseJsonArray(row.synonymsJson));
  const expanded = [q, ...synonyms].map((term) => `(${term})`).join(" OR ");
  const typeFilter = type === "all" ? "" : type;

  const results = await prisma.$queryRaw<
    { kind: string; id: string; slug: string; title: string; summary: string | null; rank: number; headline: string; created: Date }[]
  >`
    WITH search AS (SELECT websearch_to_tsquery('simple', ${expanded}) AS query)
    SELECT * FROM (
      SELECT 'location'::text kind, id, slug, name title, summary,
        (
          1.6 * ts_rank_cd(to_tsvector('simple', coalesce(name,'')), search.query) +
          1.1 * ts_rank_cd(to_tsvector('simple', coalesce(summary,'') || ' ' || coalesce(description,'')), search.query) +
          similarity(name, ${q})
        )::float8 rank,
        ts_headline('simple', coalesce(summary, name), search.query, 'MaxWords=18,MinWords=8') AS headline,
        "createdAt" AS created
      FROM "Location", search
      WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (${typeFilter} = '' OR ${typeFilter} = 'location')
        AND (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR name % ${q})
      UNION ALL
      SELECT 'organisation', id, slug, name, description,
        (ts_rank_cd(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(type,'')), search.query) + similarity(name, ${q}))::float8,
        ts_headline('simple', coalesce(description, name), search.query, 'MaxWords=18,MinWords=8'),
        "createdAt"
      FROM "Organisation", search
      WHERE status = 'PUBLISHED' AND "mergedIntoId" IS NULL
        AND (${province} = '' OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (${typeFilter} = '' OR ${typeFilter} = 'organisation')
        AND (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(type,'')) @@ search.query OR name % ${q})
      UNION ALL
      SELECT 'funding', id, slug, title, summary,
        (ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query) + CASE WHEN deadline IS NOT NULL AND deadline > NOW() THEN 0.15 ELSE 0 END)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8'),
        "createdAt"
      FROM "FundingCall", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (${typeFilter} = '' OR ${typeFilter} = 'funding')
        AND (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR title % ${q})
      UNION ALL
      SELECT 'procurement', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8'),
        "createdAt"
      FROM "Procurement", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (${typeFilter} = '' OR ${typeFilter} = 'procurement')
        AND (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR title % ${q})
      UNION ALL
      SELECT 'event', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8'),
        "createdAt"
      FROM "EcosystemEvent", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (${typeFilter} = '' OR ${typeFilter} IN ('event', 'events'))
        AND (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR title % ${q})
      UNION ALL
      SELECT 'programme', id, slug, title, summary, ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'')), search.query)::float8,
        ts_headline('simple', coalesce(summary, title), search.query, 'MaxWords=18,MinWords=8'),
        "createdAt"
      FROM "Programme", search WHERE status = 'PUBLISHED'
        AND (${province} = '' OR "provinceId" IS NULL OR "provinceId" IN (SELECT id FROM "Province" WHERE slug = ${province} OR code = ${province} OR name = ${province}))
        AND (${typeFilter} = '' OR ${typeFilter} IN ('programme', 'programmes'))
        AND (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'')) @@ search.query OR title % ${q})
    ) ranked
    ORDER BY
      CASE WHEN ${sort} = 'title' THEN title END ASC,
      CASE WHEN ${sort} = 'newest' THEN created END DESC,
      rank DESC, title ASC
    LIMIT ${limit + offset}
  `;
  const paged = results.slice(offset, offset + limit);
  return {
    query: q,
    expandedWith: synonyms,
    suggestions: synonyms.slice(0, 8),
    results: paged,
    total: results.length,
    page,
    pages: Math.max(1, Math.ceil(results.length / limit)),
  };
}
