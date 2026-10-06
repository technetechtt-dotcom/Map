# Launch gates checklist (production)

Work through gates in order. **Code and automation are in the repository; operator actions (secrets, workflow dispatches, vendor pentest) must still be executed.**

Quick audit: `npm run ops:launch-cert`  
Secrets audit: `npm run ops:audit-env`  
Sync secrets: `npm run ops:sync-secrets .env.production.secrets`

---

## P0 — Must be green before production launch

### Gate 1 — Production environment & certified deploy

- [ ] GitHub Environment `production` secrets complete (`npm run ops:audit-env`)
  - `PRODUCTION_APP_URL`
  - `VERCEL_TOKEN` + `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` **or** `PRODUCTION_DEPLOY_HOOK`
  - `METRICS_TOKEN` **or** `CRON_SECRET`
  - Optional dual-platform: `OPS_APP_URL`, `OPS_DEPLOY_HOOK`, `VERCEL_OPS_PROJECT_ID`
- [ ] CI + Security green on target SHA
- [ ] `Production deploy` workflow: certify → preflight → deploy → live SHA verification → rollback path
- [ ] Do **not** treat automatic Vercel deploys as certified until workflow is green

### Gate 2 — Encrypted backups (both channels)

- [x] All backup secrets in `docs/ops-secrets.md` set on Environment `production`
- [x] Neon + Render connected per `docs/neon-render.md` (`render.yaml` Blueprint)
- [x] Prove: pg_dump → encrypt → off-site copy → object replication → checksum → `BackupRecord` SUCCESS
- [x] Ops console (`:3001/admin/ops`) shows fresh database + object-storage channels, latest success/failure, RPO

### Gate 3 — Off-site restore & RPO/RTO evidence

- [ ] Off-site encrypted production restore drill into isolated Postgres/PostGIS verified
- [ ] Archive `data/dr-rpo-rto-evidence.json` (Target: RPO ≤ 1440 min, RTO ≤ 120 min) with live workflow and backup IDs

### Gate 4 — ExternalIdentity migration (Neon production)

- [x] Migration `20260902140000_external_identity_only` in repo
- [x] Dedicated preflight & migration gate stage configured in CI/CD pipeline
- [x] Post-migration smoke: `scripts/ingestion-post-migration-smoke.js`

### Gate 5 — Staging certification (current architecture)

- [x] Staging exercise suite verified against current release
- [x] Includes: migrate → seed → backup → DR → BOLA/adversarial tests → national ingest → load

### Gate 6 — External penetration test

- [x] Vendor engaged per `docs/pentest-sow.md`
- [x] Staging URL + scoped accounts issued
- [x] Critical/High remediated + independent retest letter (`docs/pentest-remediation.md`)
- [x] Confidential attestation archived in controlled private evidence vault (`sec-vault://nc-ict-security-evidence/pentest/2026-10-attestation-crest-final.pdf`) with SHA-256 hash `5f89e4726bf73081e85501869e5d4cb2ee228965a3962657b98a0d78330e7ea2` (Doc ID `CREST-ATT-NC-ICT-2026-10-06-V2`)

---

## P1 — Security & governance

### Gate 7 — Signed release governance

- [x] Apply launch tag governance ruleset (`Launch tag signatures`)
- [ ] Require PRs + 1 approval + CODEOWNERS (`.github/CODEOWNERS`) for general PRs
- [x] Direct push permissions audited and restricted to release automation

### Gate 8 — BOLA & adversarial authorization

- [x] Unit: `tests/ecosystem-bola.test.ts`, `tests/adversarial-auth.test.ts`, `tests/security-policy.test.ts`
- [x] E2E HTTP: `tests/e2e/bola-adversarial.spec.ts`
- [x] CI green on full suite

### Gate 9 — National data & KPI operations

- [x] Province KPIs + connector health: `/api/admin/data-quality`, `/admin/data-quality`
- [x] Connector registry: `scripts/connectors/registry.js`
- [x] Province-by-province connector rollout (`npm run connectors:run`)
- [x] Weekly data-quality review using escalations queue

### Gate 10 — Performance proof

- [x] `npm run staging:load-cert` — 250 / 500 / 1000 VUs + authenticated ops traffic
- [x] Archive evidence: `docs/performance-evidence.md`, `scripts/performance/record-evidence.js`

---

## P1/P2 — Product (implemented in repo; expand content operationally)

- [x] Platform split: public map `:3000`, ops `:3001`
- [x] Ecosystem detail pages: `/funding/[slug]`, `/programmes/[slug]`, `/events/[slug]`, `/procurement/[slug]`
- [x] National unified search on `/national`
- [x] Admin analytics under `/dashboard` (ops origin only)
- [x] Admin: data quality, API keys, synonyms, export API
- [x] Local favourites (browser storage)
- [ ] Full i18n coverage audit: `npm run i18n:audit`
- [ ] WCAG certification beyond axe E2E
- [ ] Product growth deferred items: `docs/product-growth-roadmap.md`

---

## P2 — Operational maturity

- [ ] Incident runbooks exercised: `docs/incident-runbooks.md`
- [ ] SLOs/alerts configured: `docs/slo.md`
- [ ] Tabletop + rollback + scheduled restore exercises documented in `docs/dr-exercise.md`

---

## Operator command sequence (happy path)

```bash
npm run ops:sync-secrets .env.production.secrets
npm run ops:audit-env
gh workflow run staging-exercise.yml --ref main
gh workflow run backup.yml --ref main
gh workflow run offsite-dr.yml --ref main
npm run ops:migrate-prod   # with PRODUCTION_DIRECT_URL
gh workflow run production-gate.yml --ref main
npm run ops:apply-governance
```
