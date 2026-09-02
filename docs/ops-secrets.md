# Production GitHub Environment secrets

Daily backups and certified deploys fail closed until these exist on GitHub Environment **`production`**. Repository secrets are not enough if the workflows bind `environment: production`.

## Encrypted production backup

```bash
gh secret set PRODUCTION_DIRECT_URL --env production
gh secret set PRODUCTION_DATABASE_URL --env production
gh secret set BACKUP_ENCRYPTION_KEY --env production
gh secret set BACKUP_DESTINATION --env production
gh secret set RCLONE_CONFIG --env production
gh secret set S3_BUCKET --env production
gh secret set S3_BACKUP_BUCKET --env production
gh secret set S3_ACCESS_KEY_ID --env production
gh secret set S3_SECRET_ACCESS_KEY --env production
gh secret set S3_BACKUP_ACCESS_KEY_ID --env production
gh secret set S3_BACKUP_SECRET_ACCESS_KEY --env production
gh secret set PRODUCTION_APP_URL --env production
gh secret set CRON_SECRET --env production
```

Optional: `NEON_API_KEY` + `NEON_PROJECT_ID` (creates a daily Neon PITR branch even when rclone is not yet configured). `NOTIFY_WEBHOOK_URL` pages operators on failure.

`PRODUCTION_DIRECT_URL` must be the **unpooled** Neon connection string. The pooled runtime URL is not valid for `pg_dump`.

## Production deploy

One of:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, or
- `PRODUCTION_DEPLOY_HOOK`

Always:

- `PRODUCTION_APP_URL`
- `METRICS_TOKEN` or `CRON_SECRET` (must match Vercel runtime)

`CRON_SECRET` on GitHub and Vercel must be identical so backup health recording and post-deploy SHA proof both work.

## Complementary Neon snapshot

Project `northern-cape-ict-map` (`old-night-27455221`). A recoverable branch `backup-2026-09-02` was created from `main` when off-site rclone secrets were still missing. This is not a substitute for encrypted off-site copies once rclone is configured.
