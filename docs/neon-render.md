# Neon + Render connection

## Neon (already provisioned)

| Field | Value |
| --- | --- |
| Project | `northern-cape-ict-map` (`old-night-27455221`) |
| Branch | `br-noisy-dew-auh86pm6` |
| Database | `neondb` |
| Region | `aws-us-east-1` |
| Pooled host | `ep-mute-sun-auhhwkkr-pooler.c-10.us-east-1.aws.neon.tech` |
| Direct host | `ep-mute-sun-auhhwkkr.c-10.us-east-1.aws.neon.tech` |

Local setup:

```bash
# From Neon Console → Connection details (or MCP get_connection_string)
NEON_DATABASE_URL='postgresql://…pooler…/neondb?sslmode=require' node scripts/set-neon-env.js
npm run neon:verify
npx prisma migrate deploy
```

Use **pooled** for `DATABASE_URL` (runtime) and **unpooled** for `DIRECT_URL` (migrations / `pg_dump`).

## Render

Blueprint file: [`render.yaml`](../render.yaml)

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect GitHub repo `technetechtt-dotcom/Map`, branch `main`.
3. Apply blueprint → creates `sa-ict-map-public` and `sa-ict-map-ops`.
4. For **each** service, set Environment:

| Key | Public service | Ops service |
| --- | --- | --- |
| `DATABASE_URL` | Neon pooled URL | same |
| `DIRECT_URL` | Neon unpooled URL | same |
| `NEXTAUTH_URL` | `https://sa-ict-map-public.onrender.com` | `https://sa-ict-map-ops.onrender.com` |
| `PUBLIC_APP_URL` / `NEXT_PUBLIC_PUBLIC_APP_URL` | public onrender URL | public onrender URL |
| `OPS_APP_URL` / `NEXT_PUBLIC_OPS_APP_URL` | ops onrender URL | ops onrender URL |
| `NEXTAUTH_SECRET` | same value on both | same value on both |

Copy generated secrets (`CRON_SECRET`, `METRICS_TOKEN`, encryption keys) from public → ops so both share them.

5. After first deploy succeeds, set GitHub Environment `production`:

```bash
gh secret set PRODUCTION_APP_URL --env production --body "https://sa-ict-map-public.onrender.com"
gh secret set PRODUCTION_DEPLOY_HOOK --env production   # paste Render Deploy Hook
gh secret set PRODUCTION_DATABASE_URL --env production  # Neon pooled
gh secret set PRODUCTION_DIRECT_URL --env production    # Neon unpooled
```

Render **Deploy Hook**: Service → Settings → Deploy Hook → use as `PRODUCTION_DEPLOY_HOOK`.

6. Verify:

```bash
curl -fsS https://sa-ict-map-public.onrender.com/api/health/live
curl -fsS https://sa-ict-map-ops.onrender.com/api/health/live
```

## Notes

- Free/starter Render instances cold-start; first health check may take 30–60s.
- Blueprint sets `RENDER_NEON_BOOTSTRAP=1` so the app can boot with Neon alone (local storage + memory rate limits). Remove that flag after S3, Upstash Redis, CAPTCHA, and email are configured — see `docs/ops-secrets.md`.
- Do not commit `.env` or Neon passwords.
- Local Neon verify: `npm run neon:verify` (expects PostGIS + pg_trgm on project `old-night-27455221`).
