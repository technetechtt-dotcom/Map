-- Backfill ExternalIdentity from deprecated Location.externalId, then drop denormalized columns.
-- Matching uses ExternalIdentity exclusively (see docs/source-authority.md).

INSERT INTO "ExternalIdentity" ("id", "connector", "externalId", "entityType", "entityId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  COALESCE(NULLIF(l."verificationSource", ''), NULLIF(l."coordSource", ''), 'legacy-import'),
  l."externalId",
  'location',
  l."id",
  NOW(),
  NOW()
FROM "Location" l
WHERE l."externalId" IS NOT NULL
  AND l."externalId" <> ''
ON CONFLICT ("connector", "externalId", "entityType") DO NOTHING;

INSERT INTO "ExternalIdentity" ("id", "connector", "externalId", "entityType", "entityId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'legacy-import',
  o."externalId",
  'organisation',
  o."id",
  NOW(),
  NOW()
FROM "Organisation" o
WHERE o."externalId" IS NOT NULL
  AND o."externalId" <> ''
ON CONFLICT ("connector", "externalId", "entityType") DO NOTHING;

DROP INDEX IF EXISTS "Location_externalId_idx";
DROP INDEX IF EXISTS "Organisation_externalId_idx";
ALTER TABLE "Location" DROP COLUMN IF EXISTS "externalId";
ALTER TABLE "Organisation" DROP COLUMN IF EXISTS "externalId";
