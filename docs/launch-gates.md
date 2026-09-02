# Launch gates checklist

Work through these gates in order. Product growth (matching, analytics dashboards, network analysis) starts only after every gate is green.

## Gate 1 — Tenant isolation (BOLA)

- [x] `assertEcosystemAccess()` on ecosystem PATCH/DELETE and manage lists
- [x] Cross-tenant unit tests (`tests/ecosystem-bola.test.ts`)
- [ ] Re-run full RBAC + integration suite on CI

## Gate 2 — Production deploy certification

- [ ] GitHub Environment `production` secrets complete (`node scripts/audit-production-env.js`)
- [ ] CI + Security green on target SHA
- [ ] `Production deploy` workflow certifies and deploys exact SHA (`scripts/post-deploy-verify.js` pass)

## Gate 3 — Encrypted backups

- [ ] All secrets in `docs/ops-secrets.md` set on Environment `production`
- [ ] Manual dispatch: `gh workflow run backup.yml --ref main`
- [ ] Ops console shows fresh database + objects channels
- [ ] Off-site rclone verification passes in workflow

## Gate 4 — Off-site restore & RPO/RTO evidence

- [ ] `gh workflow run offsite-dr.yml --ref main` (or `npm run backup:offsite-dr` locally with secrets)
- [ ] `data/dr-rpo-rto-evidence.json` archived with ticket + workflow URL
- [ ] RPO ≤ 1440 min, RTO ≤ 120 min (or documented exception)

## Gate 5 — External penetration test

- [ ] Vendor engaged with `docs/pentest-sow.md`
- [ ] Staging URL + scoped accounts issued
- [ ] Critical/High findings closed with retest letter

## Gate 6 — Staging exercise (current architecture)

- [ ] `gh workflow run staging-exercise.yml --ref main` after latest merge
- [ ] Includes migrate → seed → backup → destructive restore → smoke → national load
- [ ] Evidence newer than 2026-08-21 baseline

## Gate 7 — Signed release governance

- [ ] Enable `docs/branch-protection-launch.json` (PR + signed commits)
- [ ] Stop routine unsigned direct pushes to `main`
- [ ] Release tags signed (`git tag -s`)

## Gate 8 — ExternalIdentity-only matching

- [x] Migration `20260902140000_external_identity_only`
- [ ] `prisma migrate deploy` on Neon
- [ ] Ingest apply continues via `ExternalIdentity` only

## Gate 9 — National ingestion KPIs

- [x] Province coverage + connector health in `/api/admin/data-quality`
- [ ] Province-by-province connector rollout per `docs/national-rollout.md`
- [ ] KPI review in admin review queue weekly

## Gate 10 — Product growth (post-gates)

- Richer opportunity matching
- Intelligence / analytics dashboards
- Stakeholder dashboards
- Funding / procurement discovery
- Ecosystem network analysis
