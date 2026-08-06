# Next.js 15 upgrade plan

Current production target: **Next 14.2.35** (App Router) — last fully green build in this repo.

## Why not automated yet

- `next-auth` v4 + App Router middleware typing needs a checkout of Auth.js v5 for first-class Next 15 support.
- React 19 peer range on Next 15 may pull ecosystem churn (`react-leaflet`, `recharts`, `next-intl`).
- CI currently pins `eslint-config-next@14.2.35` together with Next.

## Recommended sequence

1. Branch `chore/next-15`; bump next, eslint-config-next, and types.
2. Fix app-router async request APIs (`params` / `searchParams` promises) file-by-file.
3. Run full suite: `npm test`, typecheck, lint, production build.
4. Manual smoke: login + MFA, map tiles, book print, admin locations, imports.
5. Only then merge; keep rollback image on 14.2.x.

## Interim

Stay on 14.2.x patch line; continue dependency audit in CI (`npm audit --audit-level=high`).
