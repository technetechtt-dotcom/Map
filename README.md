# SA ICT Ecosystem Map — Phases 1–4

Full-stack platform evolving the Northern Cape ICT Interactive Map MVP into a national innovation ecosystem map with management workflows, community submissions, analytics and multi-province support.

## Quick start (local SQLite — works offline)

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo accounts
| Role | Email | Password |
|---|---|---|
| Super admin | `admin@ictmap.gov.za` | `Admin123!` |
| NC provincial admin | `nc.admin@ictmap.gov.za` | `Admin123!` |
| Org admin | `org@dedat.example` | `Admin123!` |

## Phase coverage

### Phase 1 — Northern Cape public MVP
- Official district/municipality **structure** + map boundary layers (seed envelopes; swap for MDB/PostGIS layers in production)
- Full NC spreadsheet: `data/NC_ICT_Locations_Full.csv` (100+ curated rows)
- Desktop verification batch flags (`lastVerifiedAt`, verification notes/sources)
- Marker **clustering** + **visible-map-area search**
- Rich location cards + **profile pages** at `/locations/[slug]`
- Public frontend: Next.js app (deployable to Vercel/Node)

### Phase 2 — Management system
- Data layer via Prisma (SQLite for local; PostgreSQL/PostGIS via Docker ready)
- REST API under `/api/*`
- Administrator login (NextAuth credentials)
- Create / verify / publish / archive workflows in `/admin/locations`
- Image / document **uploads** (`POST /api/uploads`)
- Source records on locations
- Audit logs + JSON backups

### Phase 3 — Ecosystem platform
- Funding calls, events, programmes, procurement pages + API
- Community submissions (`/submit` → admin moderation)
- Organisation accounts
- Analytics / provincial dashboards (`/dashboard`)
- Multilingual UI strings (en / af / xh / zu)

### Phase 4 — National expansion
- All 9 provinces in geography model + national boundary GeoJSON
- Seed hubs in other provinces for national search
- Provincial administrator role + scoped user management
- Province filter on public map for national search/reporting

## Production PostgreSQL / PostGIS

```bash
# Start Docker Desktop, then:
docker compose up -d

# Point DATABASE_URL at Postgres (see .env example), then use schema:
# prisma/schema.postgres.prisma  (or migrate arrays to native Postgres types)
```

`docker-compose.yml` runs `postgis/postgis:16-3.4` on port **5433**.  
`scripts/init-postgis.sql` enables PostGIS.  
Boundary GeoJSON can be imported into geometry columns with `ST_GeomFromGeoJSON`.

## Deploy public frontend

### Vercel
1. Push repo to GitHub
2. Import project in Vercel
3. Set env: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
4. Build command: `prisma generate && next build`
5. For serverless, use hosted Postgres (Neon/Supabase) instead of SQLite file

### Node / VPS
```bash
npm ci
npm run db:setup
npm run build
npm start
```

## Key routes

| Route | Purpose |
|---|---|
| `/book` | Choose national or provincial edition |
| `/book/print` | Full printable book (use Print → Save as PDF) |
| `/api/book` | JSON book payload for external typesetting |
| `/locations/[slug]` | Location profile |
| `/funding` `/events` `/programmes` `/procurement` | Ecosystem content |
| `/submit` | Community submission |
| `/dashboard` | Analytics (admin) |
| `/admin/*` | Management console |
| `/login` | Auth |

## Data files

- `data/NC_ICT_Locations_Full.csv` — full NC directory spreadsheet
- `data/boundaries/*.geojson` — district, municipality, province envelopes
- `data/boundaries/mdb/` — MDB district/local GeoJSON + book map pack (`npm run maps:mdb`)
- `data/seed/*` — seed sources
- `legacy/` — original static MVP
- **[docs/maps-sources.md](docs/maps-sources.md)** — georeferenced official map sources, REST query URLs, QGIS checklist

## Note on verification

Coordinates and themes originate from Northern Cape ecosystem materials plus curated expansion. Public launch still requires field verification of coordinates, contacts and official boundary polygons.
