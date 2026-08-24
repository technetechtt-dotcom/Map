# Next.js 15.5 LTS

Production now runs **Next.js 15.5.23** with `eslint-config-next@15.5.23` and React 18 (kept for `react-leaflet`).

## Security line

- July 2026 patches landed in 15.5.21+. This repo is on **15.5.23**, the latest published 15.5 Maintenance LTS as of 24 August 2026.
- The scheduled **15.5.24** August security release is embargoed until **26 August 2026** and is not on npm yet. Pin moves to 15.5.24 the day it publishes; do not invent a version number.

## App Router changes applied

- `cookies()` is awaited in `layout` and the home page
- `params` and `searchParams` are Promises on location, organisation, book-print, and dynamic API routes
- `serverExternalPackages` replaced `experimental.serverComponentsExternalPackages`
- `prisma generate` runs as part of `npm run build` so Vercel always has a client

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` must stay green on `main`.
