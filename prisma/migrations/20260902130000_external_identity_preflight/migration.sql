-- This migration intentionally sorts immediately before
-- 20260902140000_external_identity_only. Existing environments that already
-- dropped the legacy columns treat it as a safe no-op; fresh/staged upgrades
-- fail before ON CONFLICT can hide contradictory legacy mappings.
DO $$
DECLARE
  conflict_count INTEGER;
  conflict_sample TEXT;
BEGIN
  IF to_regclass('public."ExternalIdentity"') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'Location'
         AND column_name = 'externalId'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'Organisation'
         AND column_name = 'externalId'
     ) THEN
    RETURN;
  END IF;

  WITH legacy_candidates AS (
    SELECT
      COALESCE(NULLIF(l."verificationSource", ''), NULLIF(l."coordSource", ''), 'legacy-import') AS connector,
      l."externalId" AS "externalId",
      'location'::TEXT AS "entityType",
      l."id" AS "entityId"
    FROM "Location" l
    WHERE l."externalId" IS NOT NULL
      AND l."externalId" <> ''

    UNION ALL

    SELECT
      'legacy-import'::TEXT AS connector,
      o."externalId" AS "externalId",
      'organisation'::TEXT AS "entityType",
      o."id" AS "entityId"
    FROM "Organisation" o
    WHERE o."externalId" IS NOT NULL
      AND o."externalId" <> ''
  ),
  all_candidates AS (
    SELECT connector, "externalId", "entityType", "entityId"
    FROM legacy_candidates

    UNION ALL

    SELECT connector, "externalId", "entityType", "entityId"
    FROM "ExternalIdentity"
  ),
  conflicts AS (
    SELECT
      connector,
      "externalId",
      "entityType",
      COUNT(DISTINCT "entityId")::INTEGER AS entity_count,
      STRING_AGG(DISTINCT "entityId", ', ' ORDER BY "entityId") AS entity_ids
    FROM all_candidates
    GROUP BY connector, "externalId", "entityType"
    HAVING COUNT(DISTINCT "entityId") > 1
  ),
  samples AS (
    SELECT *, COUNT(*) OVER ()::INTEGER AS total
    FROM conflicts
    ORDER BY "entityType", connector, "externalId"
    LIMIT 10
  )
  SELECT
    COALESCE(MAX(total), 0),
    COALESCE(
      STRING_AGG(
        FORMAT('%s:%s:%s -> [%s]', "entityType", connector, "externalId", entity_ids),
        '; '
      ),
      ''
    )
  INTO conflict_count, conflict_sample
  FROM samples;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = FORMAT(
        'ExternalIdentity legacy preflight found %s conflicting identity key(s); sample: %s',
        conflict_count,
        conflict_sample
      ),
      HINT = 'Resolve each connector/externalId/entityType key to exactly one entityId before rerunning the migration.';
  END IF;
END $$;
