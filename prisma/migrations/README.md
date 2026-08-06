# Database migrations (PostgreSQL / PostGIS)

Local development uses **SQLite** via `prisma/schema.prisma` + `prisma db push`.

Production should use **PostgreSQL + PostGIS**:

```bash
docker compose up -d
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ictmap
# Align schema.prisma datasource to postgresql (or dual-track deploy pipeline)
npx prisma db push
psql "$DATABASE_URL" -f prisma/migrations/20260326_postgis_init.sql
SEED_ADMIN_PASSWORD='your-long-secret' npm run db:seed
```

## Files

| File | Purpose |
|------|---------|
| `20260326_postgis_init.sql` | Enable PostGIS, point geom on Location, GIST index |
| `../schema.postgres.prisma` | Outline for postgres datasource |
| `../../scripts/restore-backup.md` | Encrypted app backup + pg_dump restore steps |

## CI

GitHub Actions runs `prisma db push` (SQLite), unit tests, build, and a PostGIS smoke job that enables the extension.
