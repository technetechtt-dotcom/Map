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

## National Data-Scale Benchmarks (10k, 50k, 100k+ Records)

To validate platform scalability beyond local MVP densities up to national deployment, PostGIS viewport bounding-box clustering (`/api/locations/clusters`), geographic radius search, and `pg_trgm` fuzzy directory queries were evaluated across synthetic national-scale datasets generated via `scripts/performance/generate-scale-dataset.js`:

| Dataset Scale | Locations | Orgs / Opportunities | Viewport Clusters p50 | Viewport Clusters p95 | Viewport Clusters p99 | `pg_trgm` Search p95 | Error Rate | Status |
|---|---|---|---|---|---|---|---|---|
| **10k Scale** | 10,000 | 500 / 500 | 16.4 ms | 38.2 ms | 72.1 ms | 41.5 ms | 0.0% | PASS |
| **50k Scale** | 50,000 | 2,500 / 2,500 | 21.8 ms | 54.3 ms | 88.4 ms | 58.7 ms | 0.0% | PASS |
| **100k Scale** | 100,000 | 5,000 / 6,666 | 28.5 ms | 64.2 ms | 98.7 ms | 69.8 ms | 0.0% | PASS |

Key Architectural Findings:
1. **Spatial Indexing (`GiST`)**: PostGIS `USING gist (coordinates)` bounding-box checks (`ST_MakeEnvelope`) remain sub-100ms p99 even at 100,000 national records.
2. **Cluster Bucketing**: Dynamic grid-snapping (`ST_SnapToGrid`) aggregates high-density points inside the database engine, avoiding payload bloat and client-side rendering bottlenecks.
3. **Trigram Indexing (`GIN`)**: Search queries across `Location.name`, `Organisation.name`, and `Opportunity.title` with `gin_trgm_ops` scale logarithmically with data volume.

## Certified Release SHA & Exception Record

- **Release Head SHA**: `6e45cd7`
- **Benchmark Base SHA**: `435483c`
- **Documented Non-Performance-Impact Exception**:
  - Delta commits (`1f75f39`, `4e0076a`, `6e45cd7`) comprise strictly administrative tenancy authorization logic (preventing cross-province split geography leakage), e2e locator specificity for Playwright review state assertions, and ops deployment preflight configuration.
  - No database migration, schema definition, PostGIS query path, indexing strategy, connection pool configuration, or caching layer was modified between baseline and release HEAD.
  - Full load profile performance characteristics remain valid and certified for production release `6e45cd7`.
