# Next.js 15.5 LTS

Production now runs **Next.js 15.5.24** with `eslint-config-next@15.5.24` and React 18 (kept for `react-leaflet`).

## Security line

- 15.5.24 (26 August 2026) fixes two Critical-severity issues (Windows RCE GHSA-p293-qw3h-jr36 and Image Optimization AVIF/libheif GHSA-2xp9-vwfh-vxw4).
- High/Critical Next.js advisories **block** `npm run audit:deps`. There is no package allowlist for `next`.
- Next 16 / React 19 is a separate project. See `docs/next16-migration.md`.

## App Router changes applied

- `cookies()` is awaited in `layout` and the home page
- `params` and `searchParams` are Promises on location, organisation, book-print, and dynamic API routes
- `serverExternalPackages` replaced `experimental.serverComponentsExternalPackages`
- `prisma generate` runs as part of `npm run build` so Vercel always has a client
- Lint uses `eslint src tests` instead of deprecated `next lint`

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` must stay green on `main`.
