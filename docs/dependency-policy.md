# Dependency update policy

High/Critical advisories fail CI. There is no Next.js allowlist.

Dependabot should open a **branch/PR**, wait for CI + Security, and merge only when the six required checks are green. Do not land a bundle of dependency bumps on `main` that immediately turns protected checks red.

This repository’s operator workflow still pushes certified fixes directly to `main` (see `docs/branch-protection.json`). That is not a licence to skip audit, secret-scan, or the production gate.

Sentry packages must stay on the same major (`@sentry/browser` and `@sentry/node`). Application, job, ingestion, and DR failures go through `src/lib/logger.ts`. `src/instrumentation.ts` must not import `@sentry/node` — Next compiles it for Edge and the Node SDK then fails the production build.

Signed commits, required PR approvals, and immutable release tags remain **launch policy** (`docs/branch-protection-launch.json`). They are not applied to live `main` while operator push-to-main is required.

## Supply-Chain & Dependency Overrides Provenance

### `braces` (CVE-2026-93687)
- **Vulnerability**: Exponential backtracking in nested bracket pattern expansion (DoS via unconstrained pattern expansion).
- **Upstream Status**: Official npm package remains at `3.0.3` with no patched upstream release available on npm registry.
- **Remediation & Review**: Fork `scastillo-jp/braces-fork` was independently reviewed. The vulnerable recursive expansion regex was replaced with bounded linear character iteration, mitigating the regex recursion DoS vector.
- **Pinning**: Pinned to immutable commit hash `2834dadbad8a79487a79eeb0aeaefb08c439893f` in `package.json` overrides and `package-lock.json` to prevent arbitrary branch head drift.
- **Governance Notice**: Passing GitHub Security audits and CI checks validates the presence of this reviewed patch, but does not represent an official upstream vendor release. Operators must monitor upstream `micromatch/braces` for an official `3.0.4+` release.
