# Disaster-recovery exercise (production-like)

Do **not** run a destructive restore against production Neon.

## Mandatory channels

Health is degraded only when **database** or **objects** backups are stale. Encrypted app-export is supplementary.

1. Take a daily encrypted `pg_dump` (`database.dump.gpg`) and SHA-256 **the ciphertext**.
2. Copy StoredObject binaries with independent source/destination credentials (Get + Put).
3. Upload both to the off-site destination and **verify** the remote checksum before recording `BackupRecord`.
4. Restore the dump into a disposable PostgreSQL/PostGIS database (`npm run backup:dr`).
5. Verify object checksums from `data/object-storage-manifest.json`.
6. Point a staging app at the restored database and smoke `/api/health/live`, login, and the map.

## Automation

`npm run staging:exercise` on CI PostGIS runs migrate → seed → backup smoke → destructive restore → load. Set `STAGING_BASE_URL` to exercise a real staging origin.

Weekly: GitHub workflow `Staging exercise`.
