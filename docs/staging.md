# Staging and production parity

Create a staging stack that is separate from production:

| Concern | Staging | Production |
| --- | --- | --- |
| Database | Neon branch or project, PostGIS + pg_trgm | Neon primary, pooled runtime URL + unpooled `DIRECT_URL` |
| Runtime DB role | DML only | DML only (no CREATE/DROP) |
| Migration DB role | `DIRECT_URL` owner | `DIRECT_URL` owner, used only by migrate/backup |
| Redis | dedicated Upstash | dedicated Upstash |
| Object storage | staging bucket + backup bucket | production bucket + versioned backup bucket |
| CAPTCHA | staging keys | production keys |
| Email | Resend sandbox / webhook | Resend + failover webhook |
| Sentry | `SENTRY_ENVIRONMENT=staging` | `production` |
| Auth URL | staging HTTPS origin | production HTTPS origin |

## Deploy

1. `npm ci`
2. `node scripts/assert-main-green.js --wait` (blocks a red `main` SHA even when direct pushes are allowed)
3. `DIRECT_URL=... npx prisma migrate deploy` (approval gate: review migration SQL)
4. `node scripts/neon-verify.js`
5. `npm run build && npm start`
6. Post-deploy smoke: `/api/health/live`, authenticated `/api/health`, login, map tiles, one admin write
7. Rollback: previous container image + `BackupRecord` restore runbook in `docs/backup-rpo-rto.md`

Least privilege: never use the migration owner as `DATABASE_URL` for the Next.js process.

Vercel: set Ignored Build Step to `node scripts/vercel-ignored-build.js`. Production promotion also runs GitHub `Production deploy` after green CI/Security; set `PRODUCTION_DEPLOY_HOOK` to auto-promote.

## Staging exercise

`npm run staging:exercise` runs migrate → seed → encrypted backup smoke → destructive restore into a disposable PostgreSQL. The weekly workflow builds and starts a real Next.js staging app (or uses `STAGING_BASE_URL`) then runs `npm run load:national`.

- Use CI PostGIS for destructive restore. It refuses Neon URLs unless `ALLOW_DESTRUCTIVE_STAGING=1`.
- External penetration testing: `docs/pentest.md`. DR runbook: `docs/dr-exercise.md`.
