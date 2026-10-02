#!/usr/bin/env node
/**
 * Detect legacy ExternalIdentity collisions before the destructive backfill.
 * A collision is one connector/externalId/entityType key pointing at multiple
 * entity IDs, including conflicts with rows already in ExternalIdentity.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'externalId'
      AND table_name IN ('Location', 'Organisation')
  `;
  const legacyTables = new Set(columns.map((row) => row.table_name));

  if (legacyTables.size === 0) {
    console.log(JSON.stringify({ ok: true, legacyColumnsPresent: false, conflicts: 0 }));
    return;
  }

  const tableRows = await prisma.$queryRaw`
    SELECT to_regclass('public."ExternalIdentity"')::TEXT AS name
  `;
  if (!tableRows[0]?.name) {
    throw new Error("ExternalIdentity table is missing while legacy externalId columns are still present");
  }

  const sources = [];
  if (legacyTables.has("Location")) {
    sources.push(`
      SELECT
        COALESCE(NULLIF(l."verificationSource", ''), NULLIF(l."coordSource", ''), 'legacy-import') AS connector,
        l."externalId" AS "externalId",
        'location'::TEXT AS "entityType",
        l."id" AS "entityId"
      FROM "Location" l
      WHERE l."externalId" IS NOT NULL AND l."externalId" <> ''
    `);
  }
  if (legacyTables.has("Organisation")) {
    sources.push(`
      SELECT
        'legacy-import'::TEXT AS connector,
        o."externalId" AS "externalId",
        'organisation'::TEXT AS "entityType",
        o."id" AS "entityId"
      FROM "Organisation" o
      WHERE o."externalId" IS NOT NULL AND o."externalId" <> ''
    `);
  }

  const conflicts = await prisma.$queryRawUnsafe(`
    WITH all_candidates AS (
      ${sources.join("\nUNION ALL\n")}
      UNION ALL
      SELECT connector, "externalId", "entityType", "entityId"
      FROM "ExternalIdentity"
    )
    SELECT
      connector,
      "externalId",
      "entityType",
      COUNT(DISTINCT "entityId")::INTEGER AS "entityCount",
      ARRAY_AGG(DISTINCT "entityId" ORDER BY "entityId") AS "entityIds"
    FROM all_candidates
    GROUP BY connector, "externalId", "entityType"
    HAVING COUNT(DISTINCT "entityId") > 1
    ORDER BY "entityType", connector, "externalId"
    LIMIT 20
  `);

  if (conflicts.length > 0) {
    console.error(
      JSON.stringify({
        ok: false,
        legacyColumnsPresent: true,
        conflicts: conflicts.length,
        sampleLimit: 20,
        mappings: conflicts,
        resolution: "Resolve every identity key to one entityId before migration.",
      })
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, legacyColumnsPresent: true, conflicts: 0 }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
