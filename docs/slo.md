# Production SLOs

These are the operating targets for the certified production SHA. Misses page operators; they do not silently degrade the production gate.

| SLO | Target | Measurement |
| --- | --- | --- |
| Availability | 99.5% monthly excluding planned maintenance | `/api/health/live` + platform status |
| Public API latency | p95 < 750 ms at the certified VU profile | k6 evidence JSON |
| Search latency | p95 < 900 ms | `/api/search` |
| Ingestion freshness | connector `lastSeenAt` < 7 days for active sources | `IngestionConnectorRun` |
| Backup RPO | ≤ 24 hours from latest **SUCCESS** backup | `BackupRecord.status = SUCCESS` |
| Backup RTO | ≤ 120 minutes for isolated restore | off-site DR exercise |
| Verification freshness | desktop/field records inside TTL | re-verification campaigns |

Application errors, job failures, ingestion schema-drift, and DR failures must create a Sentry event or operator webhook. Production deploy stays fail-closed: a red SHA is not shipped.
