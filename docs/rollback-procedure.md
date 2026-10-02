# Production Rollback Procedure

This runbook defines the emergency rollback procedures for both application code and PostgreSQL/PostGIS database migrations on the SA ICT Map platform.

---

## 1. Fast Application Code Rollback

If a newly deployed certified SHA exhibits critical regressions, high error rates (5xx), or fails post-deploy verification:

### Method A: GitHub Actions Release Redeploy (Recommended)
1. Identify the last known good commit SHA:
   ```bash
   git log -n 5 --oneline
   ```
2. Trigger the **Production deploy** workflow targeting the previous green SHA via GitHub Actions or CLI:
   ```bash
   gh workflow run "Production deploy" -f sha=<PREVIOUS_CERTIFIED_SHA>
   ```
3. The workflow verifies that the previous SHA has passing CI and Security checks, validates environment configurations, and deploys both public and ops applications simultaneously.
4. Confirm live instances report the rolled-back SHA:
   ```bash
   node scripts/post-deploy-verify.js
   ```

### Method B: Render / Vercel Console Rollback
- **Render (sa-ict-map-public and sa-ict-map-ops)**:
  1. Open the Render Dashboard for each service.
  2. Navigate to the **Deploys** tab.
  3. Select the prior successful deploy and click **Rollback to this deploy**.
- **Vercel (if enabled)**:
  1. Open project deployments, select the prior production deployment, and click **Promote to Production**.

---

## 2. Database Migration Rollback

Because Prisma employs forward-only migrations (`prisma migrate deploy`), rolling back a schema change must be handled with precision to preserve relational integrity.

### Pre-migration Safeguards (Automated in CI)
- A full database backup is taken automatically before migrations run:
  ```bash
  npm run backup:pg-smoke
  ```
- Neon instant point-in-time branch snapshots exist for point-in-time recovery.

### Step 1: Assess Backward Compatibility
- If the schema change added non-breaking nullable columns or new tables, **do not immediately revert the database**. The rolled-back application code will simply ignore the new columns/tables.
- If the migration altered column types, removed columns, or applied non-nullable constraints that break the previous application version:

### Step 2: Roll Back Schema Changes
1. **Connect using unpooled direct credentials**:
   ```bash
   export DATABASE_URL="$DIRECT_URL"
   ```
2. **Apply the targeted compensating down-migration**:
   Create a forward migration or execute SQL to revert the schema alterations:
   ```bash
   npx prisma migrate diff \
     --from-schema-datamodel prisma/schema.prisma \
     --to-schema-datasource prisma/schema.prisma \
     --script > rollback.sql
   ```
   Inspect `rollback.sql` carefully, then apply:
   ```bash
   psql "$DATABASE_URL" -f rollback.sql
   ```
3. **Mark the reverted migration as rolled back in Prisma's migration table**:
   ```bash
   npx prisma migrate resolve --rolled-back "<MIGRATION_NAME>"
   ```

### Step 3: Run Database Smoke Tests
Verify that PostGIS functions, text search indexes, and core entity queries operate normally:
```bash
node scripts/neon-verify.js
node scripts/ingestion-post-migration-smoke.js
```

---

## 3. Post-Rollback Verification

1. Verify public map endpoint:
   ```bash
   curl -s -I "https://$PUBLIC_APP_URL/api/health/live"
   ```
2. Verify ops dashboard endpoint:
   ```bash
   curl -s -I "https://$OPS_APP_URL/api/health/live"
   ```
3. Test authentication and admin session issuance.
4. Check error tracking (Sentry) for cessation of 5xx alerts.

---

## 4. Post-Incident Review
1. Log incident details in the operational log.
2. File an issue with reproduction steps and root cause analysis (RCA).
3. Ensure corrective tests are added to `tests/` before releasing a forward fix.
