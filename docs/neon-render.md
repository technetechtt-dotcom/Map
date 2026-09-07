# Neon + Render connection

## Neon (done)

See [`docs/neon-setup.md`](neon-setup.md). Project **Eccosystem Map** (`curly-field-07647377`), branch `production`, seeded and migrated.

| Role | Host |
| --- | --- |
| Pooled (`DATABASE_URL`) | `ep-morning-water-ax221rnn-pooler.c-4.us-east-2.aws.neon.tech` |
| Direct (`DIRECT_URL`) | `ep-morning-water-ax221rnn.c-4.us-east-2.aws.neon.tech` |

## Render (do this now)

Blueprint: [`render.yaml`](../render.yaml) — shared env group `sa-ict-shared` + services `sa-ict-map-public` / `sa-ict-map-ops`.

### 1. Generate paste sheet (local)

```bash
npm run ops:prepare-render
```

Opens values in `.env.render` (gitignored) including your Neon URLs.

### 2. Create Blueprint

1. Open https://dashboard.render.com/blueprints/new  
2. Connect GitHub repo **`technetechtt-dotcom/Map`**, branch **`main`**.  
3. Apply `render.yaml`.  
4. When prompted for **`DATABASE_URL`** / **`DIRECT_URL`**, paste from `.env.render`.  
5. After services exist, set URL env on each service (or update Environment):

| Variable | Public (`sa-ict-map-public`) | Ops (`sa-ict-map-ops`) |
| --- | --- | --- |
| `NEXTAUTH_URL` | `https://sa-ict-map-public.onrender.com` | `https://sa-ict-map-ops.onrender.com` |
| `PUBLIC_APP_URL` / `NEXT_PUBLIC_PUBLIC_APP_URL` | public URL | public URL |
| `OPS_APP_URL` / `NEXT_PUBLIC_OPS_APP_URL` | ops URL | ops URL |

(Use your real `.onrender.com` hostnames if Render assigned different ones.)

### 3. Wire GitHub + smoke

```bash
npm run ops:finish-render -- https://sa-ict-map-public.onrender.com https://sa-ict-map-ops.onrender.com
# optional deploy hook as 3rd arg:
# npm run ops:finish-render -- <public> <ops> <https://api.render.com/deploy/srv-…>
```

Deploy Hook: each service → **Settings** → **Deploy Hook**.

### 4. Verify

```bash
curl -fsS https://sa-ict-map-public.onrender.com/api/health/live
curl -fsS https://sa-ict-map-ops.onrender.com/api/health/live
```

## Notes

- Starter instances cold-start (~30–60s).
- `RENDER_NEON_BOOTSTRAP=1` allows Neon-only boot; remove after S3 / Upstash / CAPTCHA / email — see `docs/ops-secrets.md`.
- Optional: paste a Render API key and we can automate service creation via API.
