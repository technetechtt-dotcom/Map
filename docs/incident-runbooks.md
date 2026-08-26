# Incident response runbooks

Page the platform owner. Do not weaken CI, branch protection, or the production gate to “recover.”

## Database outage

1. Confirm `/api/health/live` vs `/api/health`.
2. Check Neon/Postgres status and connection pool errors in logs.
3. Fail closed: keep the origin in maintenance if writes cannot be served.
4. Restore only into disposable PostGIS (`scripts/offsite-restore-exercise.js`). Never restore onto production Neon as the first step.

## Object storage (S3) outage

1. Public reads of map HTML can continue; uploads and object backup cannot.
2. Treat object-backup `PARTIAL`/`FAILED` as stale health. RPO uses last SUCCESS only.
3. When the provider returns, run `npm run backup:objects` and a sample verification, not a full historical re-hash.

## Compromised credentials

1. Rotate the affected secret in the host (Vercel/GitHub/Neon/S3).
2. Revoke sessions (`sessionVersion`) and API keys.
3. Do not commit replacements. Re-run secret-scan after the rotation is live.

## Failed deployment

1. Production Gate skipping a red SHA is correct.
2. Fix the failing required check on `main`.
3. Redeploy only the certified SHA (`scripts/assert-main-green.js`).

## Broken ingestion source

1. `schemaDrift` quarantines the batch (`REJECTED`). Do not apply.
2. Fix the connector mapping or pause the URL env.
3. Resume with `data.ingest` once the payload matches required fields (`name`, `latitude`, `longitude`).

## Stale data

1. Open `/admin/review` and the data-quality KPIs.
2. Run `data.reverify` for records approaching expiry.
3. Missing-from-source is review + archive by miss count, never immediate delete.

## Degraded search

1. Confirm PostGIS/`pg_trgm` on the database.
2. Rate-limit 429s are expected under abuse; they are not an outage.
3. If FTS falls back to `contains`, check Postgres logs.

## Backup failure

1. A PARTIAL object run must not look healthy.
2. Inspect `BackupRecord.failureReason` and `failedObjects`.
3. Re-run the encrypted backup workflow. Page if RPO from last SUCCESS exceeds 24 hours.
