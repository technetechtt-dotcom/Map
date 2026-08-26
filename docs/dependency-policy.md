# Dependency update policy

High/Critical advisories fail CI. There is no Next.js allowlist.

Dependabot should open a **branch/PR**, wait for CI + Security, and merge only when the six required checks are green. Do not land a bundle of dependency bumps on `main` that immediately turns protected checks red.

This repository’s operator workflow still pushes certified fixes directly to `main` (see `docs/branch-protection.json`). That is not a licence to skip audit, secret-scan, or the production gate.

Sentry packages must stay on the same major (`@sentry/browser` and `@sentry/node`). Application, job, ingestion, and DR failures go through `src/lib/logger.ts`. `src/instrumentation.ts` must not import `@sentry/node` — Next compiles it for Edge and the Node SDK then fails the production build.

Signed commits, required PR approvals, and immutable release tags remain **launch policy** (`docs/branch-protection-launch.json`). They are not applied to live `main` while operator push-to-main is required.
