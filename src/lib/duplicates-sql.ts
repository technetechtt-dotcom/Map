import { prisma } from "./prisma";

export type DuplicatePair = { a: string; b: string; score: number };

/**
 * Candidate blocking via exact keys + pg_trgm name similarity (no O(n²) JS scan).
 */
export async function findDuplicatePairsSql(opts?: { provinceId?: string; limit?: number; threshold?: number }): Promise<DuplicatePair[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const threshold = opts?.threshold ?? 0.4;
  const provinceId = opts?.provinceId ?? null;
  const rows = await prisma.$queryRaw<DuplicatePair[]>`
    SELECT a.id AS a, b.id AS b,
      GREATEST(
        similarity(lower(a.name), lower(b.name)),
        CASE
          WHEN a.email IS NOT NULL AND b.email IS NOT NULL AND lower(a.email) = lower(b.email) THEN 0.99
          ELSE 0
        END,
        CASE
          WHEN regexp_replace(coalesce(a.phone, ''), '\D', '', 'g') <> ''
           AND regexp_replace(coalesce(a.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(b.phone, ''), '\D', '', 'g')
          THEN 0.97
          ELSE 0
        END,
        CASE
          WHEN a."cipcNumber" IS NOT NULL AND b."cipcNumber" IS NOT NULL AND a."cipcNumber" = b."cipcNumber" THEN 1
          ELSE 0
        END
      )::float8 AS score
    FROM "Organisation" a
    JOIN "Organisation" b
      ON a.id < b.id
     AND a."mergedIntoId" IS NULL
     AND b."mergedIntoId" IS NULL
     AND (${provinceId}::text IS NULL OR (a."provinceId" = ${provinceId} AND b."provinceId" = ${provinceId}))
     AND (
       similarity(a.name, b.name) > ${threshold}
       OR (a.email IS NOT NULL AND b.email IS NOT NULL AND lower(a.email) = lower(b.email))
       OR (
         regexp_replace(coalesce(a.phone, ''), '\D', '', 'g') <> ''
         AND regexp_replace(coalesce(a.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(b.phone, ''), '\D', '', 'g')
       )
       OR (a."cipcNumber" IS NOT NULL AND a."cipcNumber" = b."cipcNumber")
     )
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return rows.filter((row) => row.score >= 0.85);
}
