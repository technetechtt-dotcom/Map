# Operations runbook

## Environments

| Env | Purpose | Notes |
|-----|---------|-------|
| local | Dev PostgreSQL/PostGIS | `docker compose up -d` then `npm run db:setup:dev` |
| staging | Pre-prod Postgres | parity with production config |
| production | Live PostgreSQL + PostGIS | **Never** run destructive seed without `ALLOW_DATABASE_RESET=1` |

`npm run db:setup` = generate + `prisma migrate deploy`.  
`npm run db:setup:dev` = migrate + seed for local only.  
Do not use `prisma db push` in production.

## Critical env vars

See `.env.example`. Production must set:

- `NEXTAUTH_SECRET` (32+ chars), `NEXTAUTH_URL`, `DATABASE_URL` (postgresql://), `BACKUP_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`
- Redis/Upstash for rate limits
- `TRUST_PROXY=1` behind reverse proxy only
- CAPTCHA secrets; `CAPTCHA_DISABLED` is forbidden in production
- `STORAGE_DRIVER=s3` with credentials; do not set `STORAGE_ALLOW_LOCAL_FALLBACK` in production
- `MFA_ENFORCE=1` for elevated roles
- Tile provider: `NEXT_PUBLIC_MAP_TILE_URL` (do not use public OSM for high traffic without policy)

## Release & rollback

1. Merge to main after green CI (lint, typecheck, tests, build, audit).  
2. Deploy artifact with `prisma migrate deploy`.  
3. Smoke: login, map load, admin locations, submission.  
4. Rollback: redeploy previous image; restore DB from last good `pg_dump` or encrypted app backup.

## Monitoring (targets)

Wire `SENTRY_DSN` / log shipper to capture:

- failed logins, lockouts  
- 5xx rate, API latency p95  
- backup failures (`backup.failed` log lines)  
- storage upload failures  
- verification-expiry counts from analytics dashboard  

Uptime: HTTP check on `/api/health` (and `/api/meta`) every 1–5 minutes.

## Maintenance mode

- Env: `MAINTENANCE_MODE=1` (highest priority) — public APIs/pages return 503 or `/maintenance`.
- Super-admin toggle: `PUT /api/admin/settings` with `{ "maintenance": true, "message": "…" }`.
- Super-admins can still use admin routes while maintenance is on.

## Health probe

`GET /api/health` — `{ status, db, maintenance, latencyMs }` · `Cache-Control: no-store`.

## Disaster recovery

- **RPO**: 24h (daily off-site encrypted backup + nightly `pg_dump`)  
- **RTO**: 4h for platform restore  
- Quarterly drill: restore into disposable DB using `scripts/restore-backup.md`  
- Dual custody of `BACKUP_ENCRYPTION_KEY`; document rotation with re-encrypt procedure  

## Session revocation

Admin: `PATCH /api/admin/users` with `{ id, revokeSessions: true }` or `active: false`.  
Increments `sessionVersion`; JWT rejected within 60s revalidation / immediately on `requireSession`.

## Password reset & invites

- `POST /api/auth/password-reset` → `PUT` complete  
- `POST /api/admin/invitations` → `PUT` accept  

## Data quality

Dashboard totals include `expiredVerify` and `townCentreCoords`.  
Set `ENFORCE_COORD_QUALITY=1` to block publishing with town-centre/unknown quality.

## Jobs / cron

```
POST /api/admin/jobs?job=all
Headers: x-cron-secret: $CRON_SECRET
# or authenticated provincial/super admin
```

Jobs: `expiry` (flag/demote expired verification), `prune` (analytics/audit retention), `pending-mfa`.

## Rate limits

- Development/CI may use memory or optional `RATE_LIMIT_PERSIST=1` / `RATE_LIMIT_FILE` persistence
- Production requires multi-instance Upstash: set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; Redis errors fail closed
- Authenticated operations bucket by user id when wired

## Account security

- `/account/security` — password change + **RFC 6238 TOTP** MFA (authenticator apps via base32 / otpauth URI)
- Login requires MFA code when `mfaEnabled`
- Force password change: `mustChangePassword` redirects to `/account/security`
- `/accept-invite` — invitation workflow
- `/reset-password` — token reset
- Admin users: revoke sessions / disable accounts

## Bulk import (draft-only)

1. Stage: `POST /api/admin/imports` with `{ source, rows: [{ name, latitude, longitude, provinceSlug, categorySlug, … }] }`
2. Review duplicate/nearby report; UI at `/admin/imports`
3. Apply: `POST /api/admin/imports` `{ apply: true, batchId }` → creates **DRAFT** locations only (super-admin; provincial if `IMPORT_APPLY_PROVINCIAL=1`)
4. Verify / publish through normal location workflow

## Malware scan hook

Set `AV_SCAN_URL` to a private scanner endpoint. Optional `AV_SCAN_REQUIRED=1`. Uploads call the scanner after magic-byte validation.
