# Neon setup — Eccosystem Map

| Field | Value |
| --- | --- |
| Project | **Eccosystem Map** (`curly-field-07647377`) |
| Primary branch | `production` (`br-noisy-credit-axxwijuf`) |
| Staging branch | `staging` (created from production) |
| Database | `neondb` |
| Region | `aws-us-east-2` |
| Pooled host | `ep-morning-water-ax221rnn-pooler.c-4.us-east-2.aws.neon.tech` |
| Direct host | `ep-morning-water-ax221rnn.c-4.us-east-2.aws.neon.tech` |

## Completed checklist

- [x] Local `.env` → pooled `DATABASE_URL` + unpooled `DIRECT_URL`
- [x] Prisma migrations (12) applied
- [x] Extensions: PostGIS 3.6 + `pg_trgm`
- [x] Seed: 103 locations, 49 organisations, 9 provinces, 3 admin users
- [x] GitHub Environment `production` secrets: `PRODUCTION_DATABASE_URL`, `PRODUCTION_DIRECT_URL`, `NEON_PROJECT_ID`
- [x] Staging branch created for future Render/staging use

## Local commands

```bash
# Point .env at Neon (pass pooled URL)
NEON_DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' npm run neon:set-env

npm run neon:verify
npx prisma migrate deploy
ALLOW_DATABASE_RESET=1 npm run db:seed   # destructive re-seed
```

## Demo logins (local only)

See `docs/demo-accounts.md`. Requires `ALLOW_DEMO_USERS=1` and `SEED_ADMIN_PASSWORD` in `.env`.

## Next: Render

Paste the same pooled/unpooled URLs into Render env vars — see `docs/neon-render.md`.
