# Backup RPO / RTO and disaster recovery

## Targets

| Metric | Target | How it is measured |
| --- | --- | --- |
| RPO | 24 hours (daily 00:25 UTC encrypted dump) | Age of the latest **database** and **objects** `BackupRecord` after verified off-site upload. `/api/health` degrades when a required channel is older than 36h. App-export is supplementary. |
| RTO | 2 hours | Time to restore dump + object checksum verification + application smoke. CI `npm run backup:dr` records observed minutes. |

## Restore from zero

1. Decrypt `database.dump.gpg` with `BACKUP_ENCRYPTION_KEY` (test a wrong key first; it must fail).
2. Restore into a **new** Neon/PostgreSQL database using the **direct** (non-pooler) URL.
3. `npx prisma migrate deploy` if the dump is from an older schema; otherwise the dump already contains objects.
4. `SELECT PostGIS_Version();` and `SELECT extname FROM pg_extension WHERE extname='pg_trgm';`
5. Restore uploaded objects from `S3_BACKUP_BUCKET` using `data/object-storage-manifest.json` SHA-256 checksums.
6. Point runtime `DATABASE_URL` at the pooled URL and `DIRECT_URL` at the unpooled URL.
7. Run `/api/health` and Playwright smoke.

## Object storage

Scheduled backups now export the StoredObject manifest **and** require `S3_BACKUP_BUCKET` for a second-copy of binary objects. Enable bucket versioning / object-lock on the backup bucket.

## Alerting

- GitHub Actions `Encrypted production backup` posts to `NOTIFY_WEBHOOK_URL` on failure.
- `/api/health` `alerts.backupStale` is true when the newest backup is older than 36 hours.
- Worker job `system.backup` writes checksum + object copy counts onto `BackupRecord`.
