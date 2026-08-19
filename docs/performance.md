# Performance and scale verification

Run the API workload against an isolated, production-shaped PostgreSQL/PostGIS environment:

```bash
k6 run -e BASE_URL=https://staging.example.gov.za scripts/performance/k6-map.js
```

Test seeded snapshots at 100k, 500k and 1M locations. Record database size, cache hit rate, p50/p95/p99 latency, error rate and CPU/memory for map viewport loading, radius queries, full-text search, imports and admin dashboards. The checked-in baseline requires less than 1% request failures and p95 under 750 ms for 100 concurrent map users. Store dated results with the release evidence; do not claim a scale tier until its dataset has actually run.
