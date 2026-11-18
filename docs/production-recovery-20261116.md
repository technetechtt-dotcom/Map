# Production recovery and certification — 2026-11-16

**Release status: blocked.** Do not claim successful deployment or backup until the exact release SHA passes all production gates. Do not paste credentials in tickets or CI logs.

## Evidence and symptoms

| Workflow | Job | Observation |
| --- | --- | --- |
| Production deploy run 43855910939 | deploy | `No valid deploy hook, Render API key, or GitHub Render deployment of the certified SHA was observed` |
| Encrypted backup run 43819270395 | offsite-encrypted | S3 HeadBucket HTTP 403 before the off-site copy |
| Encrypted backup run 43819270395 | Alert on backup failure | Alert endpoint returned HTTP 401 to configured operational tokens |
| Latest PR workflow | signed-commits | GitHub API-created commits are unsigned; governance blocks merge |

## 1. Deployment: both applications must be configured

In GitHub Settings > Environments > production, configure:
- PRODUCTION_APP_URL and OPS_APP_URL using the actual HTTPS public and ops origins.
- EITHER: PRODUCTION_DEPLOY_HOOK and OPS_DEPLOY_HOOK (distinct current hooks), OR RENDER_API_KEY plus RENDER_PRODUCTION_SERVICE_ID and RENDER_OPS_SERVICE_ID, OR VERCEL_TOKEN + VERCEL_ORG_ID + VERCEL_PROJECT_ID + VERCEL_OPS_PROJECT_ID.
- METRICS_TOKEN or CRON_SECRET matching the live health endpoint authentication.

Run `node scripts/ops-preflight.js deploy` inside a secure environment with the actual secrets set, without printing their values. A Render service ID by itself is not an actionable deployment trigger. Confirm the deployment of both services and verify each live SHA with `scripts/post-deploy-verify.js`.

Do not rerun a production deploy merely to diagnose misconfigured hooks. Confirm the target app, source branch and service ID first.

## 2. Offsite encrypted backups

Check S3_BACKUP_ENDPOINT (needed for R2/MinIO and other S3-compatible object stores), S3_BACKUP_REGION, S3_BACKUP_BUCKET and the independent S3_BACKUP_ACCESS_KEY_ID / S3_BACKUP_SECRET_ACCESS_KEY. Never use the primary object-store keys as the offsite keys. Do not weaken the backup isolation requirement.

The health probe now writes a random object into `healthchecks/` and deletes it, avoiding the need for `s3:ListBucket` solely for HeadBucket. The backup identity must have object writing permissions for the actual backup prefixes too (e.g. `database/*`, `objects/*`), and the healthcheck key requires PutObject and DeleteObject. These operations MUST pass before a backup is considered healthy.

In the production GitHub environment, execute the backup workflow once, then verify:
- database.dump.gpg exists at the offsite destination and its copied SHA-256 matches;
- the object-storage manifest, checksum and backup record exist;
- backup health timestamps and states appear correctly in the ops console;
- restored data passes an isolated PostgreSQL/PostGIS recovery smoke.

An S3 403 can still mean bad credentials, incorrect endpoint, wrong bucket region, or denied object permissions. The new probe does **not** bypass access controls or guarantee success.

## 3. Repair alert authentication

Set NOTIFY_WEBHOOK_URL to the correct HTTPS `/api/admin/ops/alerts` endpoint. Ensure the GitHub production secret CRON_SECRET or METRICS_TOKEN matches the **deployed app** verifying the corresponding `x-cron-secret` or `x-metrics-token` header. A successful backup with a broken alert pipeline is not certified.

Test with a low-severity operational payload using the secure secret store. A 200 means the endpoint accepted the alert; do not log tokens. Confirm an audit record or log entry.

## 4. Signed commits, branch protection and deployment gates

The changes in PR #78 were made via GitHub's Contents API, which does not sign commits on behalf of the user's Git signing key. Preserve the signed-commit policy: use a signing-enabled Git checkout to cherry-pick or recreate the commits and force-update the feature branch after review. Do **not** disable signature verification to make the workflow green.

Require an approved PR, CODEOWNERS review and passing CI/security checks before merging. The actual rulesets need to be configured by a repository administrator; the presence of JSON policy files does not prove a rule is enabled.

## 5. Release verification checklist

- [ ] Confirm fresh green CI, security, and signed-commit checks for exact target SHA.
- [ ] Run Playwright desktop and mobile flows; review 404s and link/button interactions.
- [ ] Verify data quality, town-centre coordinates and source evidence; do not represent candidate data as field-verified.
- [ ] Complete `npm run i18n:audit` and WCAG manual keyboard/screen reader coverage.
- [ ] Verify production deploy of both app origins on the signed release SHA.
- [ ] Verify offsite encrypted database and object backup.
- [ ] Restore a production backup into isolated PostGIS and record actual RPO/RTO.
- [ ] Confirm alerts, SLO dashboards, runbooks and rollback exercises.
- [ ] Record evidence and approval before labeling the release production-certified.

## Deferred product growth

Saved searches/email digests require consent management and a deliverability design. Mobile field verification requires secure identity, evidence capture and offline conflict handling. Advanced geographic intelligence requires verified source coverage. These are **not** production-release quick fixes and have not been certified as delivered by PR #78.
