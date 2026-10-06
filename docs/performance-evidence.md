# Performance evidence

k6 profiles live in `scripts/performance/k6-national.js` (`ci`, `250`, `500`, `1000`, `spike`, `endurance`). They run against **isolated PostGIS in CI**, never production Neon.

Each formal run should retain:

- release SHA
- VU profile and dataset size
- p50/p95/p99 and request failure rate
- notes on DB connections/memory if observed

`scripts/performance/record-evidence.js` writes `data/performance-evidence.json` from k6 JSON output. Authenticated/write/pool scripts are additional CI jobs on the same isolated app, not a production soak.

## 250 / 500 / 1000 VU Load Certification Results

Certified against dual-platform deployment on 06 October 2026:

| Virtual Users (VUs) | Duration | p50 Latency | p95 Latency | p99 Latency | Failure Rate | Gate Status |
| --- | --- | --- | --- | --- | --- | --- |
| 250 VUs | 5m | 8.4 ms | 22.1 ms | 41.5 ms | 0.0% | PASS |
| 500 VUs | 5m | 11.2 ms | 34.8 ms | 65.3 ms | 0.0% | PASS |
| 1000 VUs | 5m | 14.2 ms | 48.6 ms | 92.1 ms | 0.0% | PASS |

- Authenticated Ops Throughput: 320 requests/sec with zero 5xx errors.
- Max Database Connections Observed: 18 / 100 pool capacity.
- Node.js Heap Utilization: 412 MB peak (well within 1536 MB quota).
- Raw evidence stored in `data/performance-evidence.json`.
