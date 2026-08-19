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
2. `DIRECT_URL=... npx prisma migrate deploy` (approval gate: review migration SQL)
3. `node scripts/neon-verify.js`
4. `npm run build && npm start`
5. Post-deploy smoke: `/api/health`, login, map tiles, one admin write
6. Rollback: previous container image + `BackupRecord` restore runbook in `docs/backup-rpo-rto.md`

Least privilege: never use the migration owner as `DATABASE_URL` for the Next.js process.
