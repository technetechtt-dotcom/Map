# Backup encryption and database restoration

## Application encrypted exports

1. Set `BACKUP_ENCRYPTION_KEY` (16+ characters; hashed to AES-256 key).
2. Super admin calls `POST /api/admin/backups` — writes `data/backups/backup-*.enc` (AES-256-GCM, magic `ICTB1`).
3. Download encrypted blob: `GET /api/admin/backups?file=backup-….enc`
4. Decrypt via API only with session: `GET /api/admin/backups?file=…&decrypt=1` (super admin).

Never store plaintext dumps on public disks. Never include `passwordHash` (export omits it).

## PostgreSQL restore test (production checklist)

```bash
# 1) Logical dump (scheduled)
pg_dump "$DATABASE_URL" -Fc -f dump-$(date +%F).dump

# 2) Restore into disposable database
createdb ictmap_restore_test
pg_restore -d ictmap_restore_test dump-YYYY-MM-DD.dump

# 3) Sanity
psql ictmap_restore_test -c 'SELECT COUNT(*) FROM "Location";'
psql ictmap_restore_test -c 'SELECT PostGIS_Version();'

# 4) Drop test DB after verification
dropdb ictmap_restore_test
```

CI job `postgres-restore-smoke` enables PostGIS on a service container as a minimal readiness check. Full `pg_dump`/`pg_restore` should run in staging on a schedule.
