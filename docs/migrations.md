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

## Compatibility between releases & Expand/Contract Migration Policy

Because database migrations (`npx prisma migrate deploy`) execute **before** application promotion in the production deployment pipeline, zero-downtime availability requires an explicit **Expand/Contract (Two-Phase) Migration Policy**:

1. **Every migration must be backwards-compatible**:
   - Schema changes run while the *previous* version of the application is still actively serving user traffic.
   - Any migration that drops a column, renames a column/table, adds a non-null column without a default value, or modifies column data types will immediately crash the running application.

2. **Phase 1: Expand**:
   - Add new columns as **nullable** or with safe **default values**.
   - If renaming a column or changing a relationship, add the *new* column/table alongside the old one.
   - Update application code to dual-write or read from both old and new columns.
   - Deploy migration and promote the new application code.

3. **Phase 2: Contract**:
   - Once all application instances (public and ops) are running the new release and the old columns/tables are no longer referenced anywhere, deploy a subsequent migration to drop or finalize constraints on the old columns/tables.

4. **Rollback Safety**:
   - Under Expand/Contract, rolling back an application deployment to the previous green commit SHA requires no emergency database schema rollback, because the previous application version ignores new additive columns.

## PostGIS

Migration `20260812120001_postgis` enables PostGIS, syncs `Location.geom`, and adds a GIST index. Spatial queries (`radiusKm` on `/api/locations`) use `ST_DWithin`.

The former loose `prisma/migrations/20260326_postgis_init.sql` was removed because it was historical and was not a Prisma migration directory. A new installation now uses only `prisma migrate deploy`.
