# National ingestion pipeline

Each ingested record must carry `source → retrievedAt → sourceVersion → confidence → licence → verification tier → change history`.

Connectors are HTTP/API or file readers. They do **not** embed hard-coded location rows in TypeScript. Fixture JSON under `data/ingestion/` is the offline catalog; production should set `INGEST_*_URL` to the live JSON or GeoJSON API.

## Connectors

| Connector | Env URL | Offline file | Licence |
| --- | --- | --- | --- |
| `provincial-government` | `INGEST_PROVINCIAL_GOVERNMENT_URL` | `data/ingestion/provincial-government.json` | public-directory |
| `municipalities` | `INGEST_MUNICIPALITIES_URL` | `data/ingestion/municipalities.json` | public-directory |
| `universities` | `INGEST_UNIVERSITIES_URL` | `data/ingestion/universities.json` | public-directory |
| `tvet` | `INGEST_TVET_URL` | `data/ingestion/tvet.json` | public-directory |
| `seta-funders` | `INGEST_SETA_FUNDERS_URL` | `data/ingestion/seta-funders.json` | public-directory |
| `research-institutions` | `INGEST_RESEARCH_INSTITUTIONS_URL` | `data/ingestion/research-institutions.json` | public-directory |
| `innovation-hubs` | `INGEST_INNOVATION_HUBS_URL` | `data/ingestion/innovation-hubs.json` | public-directory |
| `funders` | `INGEST_FUNDERS_URL` | `data/ingestion/funders.json` | public-directory |
| `programmes` | `INGEST_PROGRAMMES_URL` | `data/ingestion/programmes.json` | public-directory |
| `procurement` | `INGEST_PROCUREMENT_URL` | `data/ingestion/procurement.json` | public-directory |
| `digital-infrastructure` | `INGEST_DIGITAL_INFRASTRUCTURE_URL` | `data/ingestion/digital-infrastructure.json` | public-directory |
| `industry-bodies` | `INGEST_INDUSTRY_BODIES_URL` | `data/ingestion/industry-bodies.json` | public-directory |
| `companies` | `INGEST_COMPANIES_URL` | `data/ingestion/companies.json` | public-directory |

`INGEST_*_URL_FILE` overrides the default file when no HTTP URL is set. Payloads may be a JSON array, `{ records: [] }`, or a GeoJSON FeatureCollection. Empty fixture files are placeholders for live URLs; they do not expand the published catalogue. Schema drift (>50% rows missing name/coordinates) quarantines the batch.

See `docs/source-authority.md` for field-level merge rules. Batch provenance stores connector `sourceVersion`, `contentHash`, `etag`, `sourceUrl`, and exact `retrievedAt`.

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
