# Performance evidence

k6 profiles live in `scripts/performance/k6-national.js` (`ci`, `250`, `500`, `1000`, `spike`, `endurance`). They run against **isolated PostGIS in CI**, never production Neon.

Each formal run should retain:

- release SHA
- VU profile and dataset size
- p50/p95/p99 and request failure rate
- notes on DB connections/memory if observed

`scripts/performance/record-evidence.js` writes `data/performance-evidence.json` from k6 JSON output. Authenticated/write/pool scripts are additional CI jobs on the same isolated app, not a production soak.
