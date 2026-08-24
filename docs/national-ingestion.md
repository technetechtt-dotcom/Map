# National ingestion pipeline

Each ingested record must carry `source → retrievedAt → sourceVersion → confidence → licence → verification tier → change history`.

Connectors are HTTP/API or file readers. They do **not** embed hard-coded location rows in TypeScript. Fixture JSON under `data/ingestion/` is the offline catalog; production should set `INGEST_*_URL` to the live JSON or GeoJSON API.

## Connectors

| Connector | Env URL | Offline file | Licence |
| --- | --- | --- | --- |
| `provincial-government` | `INGEST_PROVINCIAL_GOVERNMENT_URL` | `data/ingestion/provincial-government.json` | public-directory |
| `universities` | `INGEST_UNIVERSITIES_URL` | `data/ingestion/universities.json` | public-directory |
| `tvet` | `INGEST_TVET_URL` | `data/ingestion/tvet.json` | public-directory |
| `seta-funders` | `INGEST_SETA_FUNDERS_URL` | `data/ingestion/seta-funders.json` | public-directory |

`INGEST_*_URL_FILE` overrides the default file when no HTTP URL is set. Payloads may be a JSON array, `{ records: [] }`, or a GeoJSON FeatureCollection.

## Apply path

1. Connector load (HTTP or file)
2. Canonical entity key (`province|slug|lat3|lng3`)
3. Upsert `Location` (no duplicate create)
4. `SourceRecord` with `connector`, `retrievedAt`, `licence`, `sourceVersion`
5. `IngestionChange` before/after snapshot

```bash
npx tsx scripts/ingest-national.ts
APPLY_INGEST=1 npx tsx scripts/ingest-national.ts
```

The worker job `data.ingest` only **stages** `ImportBatch` rows. Apply remains an explicit admin / `APPLY_INGEST` step so production Neon is not mutated by a connector refresh.

Canonical seed still loads `data/seed/national-directory.js` as **directory** tier pins for the live map. Historical NC presentation rows are **desktop** tier with expiry 2027-08-21.
