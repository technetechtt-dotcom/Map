# PostgreSQL migrations

Production and CI use **one** Prisma schema: `prisma/schema.prisma` (`provider = postgresql`).

`schema.postgres.prisma` has been removed. Do not maintain a second schema.

## Local

```bash
docker compose up -d
# DATABASE_URL=postgresql://ictmap:ictmap_dev_password@localhost:5433/sa_ict_ecosystem
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='your-long-secret' ALLOW_DATABASE_RESET=1 npm run db:seed
```

`prisma db push` is **not** for production. Use it only for throwaway experiments.

## Production deploy

```bash
npx prisma migrate deploy
```

## Rollback

1. Prefer restoring the last known-good `pg_dump` (see `scripts/restore-backup.md`).
2. If a migration failed mid-way: `npx prisma migrate resolve --rolled-back MIGRATION_NAME` then restore the database.
3. Forward-fix with a new migration rather than editing applied SQL.

## Compatibility between releases

CI runs `prisma migrate deploy` against an empty PostGIS database on every push. Before a release, also run deploy against a copy of staging.

## PostGIS

Migration `20260812120001_postgis` enables PostGIS, syncs `Location.geom`, and adds a GIST index. Spatial queries (`radiusKm` on `/api/locations`) use `ST_DWithin`.
