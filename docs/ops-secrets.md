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
gh secret set NOTIFY_WEBHOOK_URL --env production
```

`S3_BUCKET` and `S3_BACKUP_BUCKET` must be different buckets, and the backup
access key pair must differ from the primary object-store key pair. The backup
preflight also requires a real HTTPS `NOTIFY_WEBHOOK_URL`; a failed scheduled or
manual backup must page operators.

Optional: `NEON_API_KEY` + `NEON_PROJECT_ID` (creates a daily Neon PITR branch even when rclone is not yet configured).

`PRODUCTION_DIRECT_URL` must be the **unpooled** Neon connection string. The pooled runtime URL is not valid for `pg_dump`.

## Production deploy

One of:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (Vercel production deployments)
- `PRODUCTION_DEPLOY_HOOK` and `OPS_DEPLOY_HOOK` (Render triggered deploy hooks)
- `RENDER_API_KEY`, `RENDER_PRODUCTION_SERVICE_ID`, and `RENDER_OPS_SERVICE_ID` (Render authenticated API deployments)

Always:

- `PRODUCTION_APP_URL`
- `OPS_APP_URL`
- `METRICS_TOKEN` or `CRON_SECRET` (must match runtime tokens)

Automatic deployments (`autoDeploy: true` or `RENDER_AUTO_DEPLOY=1`) are disabled to ensure all production deployments are coordinated by GitHub Production Gate after database migrations succeed.

`CRON_SECRET` on GitHub and production services must be identical so backup health recording and post-deploy SHA proof both work.

For the current Render deployment, `.env.render` is the local source sheet for
the runtime tokens. Synchronise only those two values without copying placeholder
notification settings:

```bash
node scripts/sync-production-secrets.js .env.render METRICS_TOKEN CRON_SECRET
```

## Complementary Neon snapshot

Project `northern-cape-ict-map` (`old-night-27455221`). A recoverable branch `backup-2026-09-02` was created from `main` when off-site rclone secrets were still missing. This is not a substitute for encrypted off-site copies once rclone is configured.

## Operator commands

Audit secret names (no values printed):

```bash
npm run ops:audit-env
```

Manual backup dispatch after secrets are set:

```bash
gh workflow run backup.yml --ref main
```

Manual production deploy (after CI green on SHA):

```bash
gh workflow run production-gate.yml --ref main
```

Off-site restore with RPO/RTO evidence:

```bash
gh workflow run offsite-dr.yml --ref main
# or locally: npm run backup:rpo-rto
```

Staging exercise (current architecture):

```bash
gh workflow run staging-exercise.yml --ref main
```
