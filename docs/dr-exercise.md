# Disaster-recovery exercise (production-like)

Do **not** run a destructive restore against production Neon.

## Mandatory channels

Health is degraded only when **database** or **objects** backups are stale. Encrypted app-export is supplementary.

1. Take a daily encrypted `pg_dump` (`database.dump.gpg`) and SHA-256 **the ciphertext**.
2. Copy the remote `database.dump.gpg` bytes back and prove `sha256(remote) == local`.
3. Copy StoredObject binaries with independent source/destination credentials (incremental Head+copy, weekly full).
4. Workflow `Off-site disaster recovery` always runs an isolated dump → checksum → encrypt → decrypt → restore → PostGIS → app-start → smoke path. The real rclone off-site restore job runs only when GitHub `BACKUP_DESTINATION` and `BACKUP_ENCRYPTION_KEY` are set; it remains fail-closed when those secrets exist but restore fails.
5. Staging exercise keeps the restore database long enough for Next.js smoke and the national load suite.

## Automation

- `KEEP_RESTORE_DB=1 npm run backup:dr` writes `data/dr-restore.json`.
- `npm run backup:offsite-dr` restores the latest rclone folder.
- Weekly: GitHub `Staging exercise`.
- Monthly / on demand: GitHub `Off-site disaster recovery` (`isolated-restore` always; `offsite-restore` when destination secrets are configured).
