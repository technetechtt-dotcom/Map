# National ingestion pipeline

Each ingested record must carry `source → retrievedAt → sourceVersion → confidence → verification status → expiry → change history`.

## Connectors

| Connector | Coverage | Licence |
| --- | --- | --- |
| `provincial-government` | Nine provincial governments | public-directory |
| `universities` | Public universities | public-directory |
| `tvet` | Public TVET colleges | public-directory |
| `seta-funders` | SETAs and public funders | public-directory |

Additional catalogs (municipalities, CIPC open data, incubators, broadband hubs, procurement, funding calls) are staged through the same `ImportBatch` contract. Do not scrape closed websites.

## Run

```bash
npx tsx scripts/ingest-national.ts          # stage ImportBatch rows
APPLY_INGEST=1 npx tsx scripts/ingest-national.ts
```

The worker job `data.ingest` stages catalogs. Apply remains an explicit admin/`APPLY_INGEST` step so production Neon is not mutated by a connector refresh.

Canonical seed already loads `data/seed/national-directory.js` as unverified public-directory pins for load tests. Historical NC presentation rows keep 2025 provenance and are **not** marked currently verified.
