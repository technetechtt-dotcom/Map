# Performance and scale verification

Generate an isolated catalog (never against Neon), seed disposable PostGIS, then ramp virtual users:

```bash
SCALE_LOCATIONS=5000 npm run load:scale-generate
# disposable Postgres only:
npm run load:scale-seed
k6 run -e LOAD_PROFILE=250 -e BASE_URL=http://127.0.0.1:3000 scripts/performance/k6-national.js
k6 run -e LOAD_PROFILE=500 -e BASE_URL=http://127.0.0.1:3000 scripts/performance/k6-national.js
k6 run -e LOAD_PROFILE=1000 -e BASE_URL=http://127.0.0.1:3000 scripts/performance/k6-national.js
```

CI uses `LOAD_PROFILE=ci` against ~800 generated rows. The full 250 / 500 / 1,000 VU ladder is `workflow_dispatch` on **Production-scale load** (profile `1000`).

Record database size, cache hit rate, p50/p95/p99 latency, error rate and CPU/memory for map viewport loading, radius queries, full-text search, imports and admin dashboards. Do not claim a scale tier until its dataset has actually run. Store dated results with the release evidence.
