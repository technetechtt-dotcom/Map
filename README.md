# SA ICT Ecosystem Map — Phases 1–4

Full-stack platform evolving the Northern Cape ICT Interactive Map MVP into a national innovation ecosystem map with management workflows, community submissions, analytics and multi-province support.

## Quick start (local SQLite)

```bash
cp .env.example .env
# set NEXTAUTH_SECRET and SEED_ADMIN_PASSWORD (min 12 chars)
# optional local demo: ALLOW_DEMO_USERS=1
npm install
npm run db:setup
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Admin accounts

Users are **never** seeded with a fixed public password. Create administrators by setting:

- `SEED_ADMIN_PASSWORD` (required for seed users; min 12 characters)
- optional `SEED_ADMIN_EMAIL`, `SEED_NC_ADMIN_EMAIL`, `SEED_ORG_ADMIN_EMAIL`
- non-production only: `ALLOW_DEMO_USERS=1` (uses seed password or a local-only default that is **not** logged)

Never deploy demo credentials to production.

### Security hardening (P0)

- Authenticated tenant scope (`/api/locations?scope=manage`) — open `admin=1` bypass removed
- Role policies: org admins / contributors **cannot** verify or publish
- Leaflet popups HTML-escaped; CSP + security headers; rate limits; CAPTCHA + honeypot on submissions
- Uploads: magic-byte validation; optional S3
- Backups: AES-256-GCM, **super-admin only**
- See `docs/data-verification.md` for verification fields and dataset size reconciliation

### Tests & CI

```bash
npm test
```

GitHub Actions: `.github/workflows/ci.yml` (Prisma, unit tests, build, PostGIS smoke).

## Phase coverage

### Phase 1 — Northern Cape public MVP
- District/municipality structure + MDB map boundaries
- Seed locations are the **PDF presentation set** (see dataset notes); CSV 100+ is candidate data only
- Verification fields (`lastVerifiedAt`, sources, expiry, coord quality)
- Marker clustering + visible-map-area search
- Profile pages at `/locations/[slug]`

### Phase 2 — Management system
- Prisma data layer (SQLite local; PostgreSQL/PostGIS via Docker)
- REST API under `/api/*` with policy checks
- NextAuth credentials (8h sessions)
- Create / verify / publish / archive in `/admin/locations`
- Secure uploads; source records; audit logs; encrypted backups

### Phase 3 — Ecosystem platform
- Funding, events, programmes, procurement
- Community submissions with rate limits + CAPTCHA/honeypot
- Org accounts + provincial dashboards + i18n

### Phase 4 — National expansion
- Nine provinces + national boundaries; provincial admin scoping

## Production PostgreSQL / PostGIS

```bash
docker compose up -d
# see prisma/migrations/README.md and scripts/restore-backup.md
```

## Deploy

Set `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `BACKUP_ENCRYPTION_KEY`, and CAPTCHA secrets. Build with `prisma generate && next build`.

Book print: `/book/print` · download: `/api/book/download` · maps: `npm run maps:mdb` (`docs/maps-sources.md`).
