# National rollout and data governance

The software is national-capable. The live catalogue remains the Northern Cape curated pilot plus directory pins. Do not invent coverage counts.

## Sequence

1. Northern Cape stewards and reviewers (current).
2. Onboard provincial data stewards for each remaining province with named SLAs.
3. Connect authoritative sources (departments, municipalities, universities, TVETs, SETAs, hubs, funders) under a data-sharing record.
4. Expand verification teams before treating directory rows as current.

## Data-sharing

Some national datasets have licence, API, privacy, or commercial restrictions. Record the licence on `ImportBatch.licence` and keep source URLs auditable. Do not ingest a source without an explicit agreement or public-data basis.

## POPIA operations

Named roles:

- Information officer / data controller: platform owner
- Operators: hosting, backups, email
- DSR handling: `/rights` + admin DSAR queue, correction SLA 30 days
- Breach: incident runbook + Sentry/webhook

Retention and DSR procedures stay in `docs/popia-governance.md`.

## Production support ownership

Someone must own availability, database operations, ingestion, verification campaigns, security alerts, DR exercises, and dependency patches. Until a named roster is published, that owner is the repository operator who deploys certified SHAs.
