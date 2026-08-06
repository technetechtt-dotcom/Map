# Data quality & national readiness

## Live dataset reality

- Primary published locations are Northern Cape PDF presentation rows.
- `data/NC_ICT_Locations_Full.csv` is **candidate** inventory — not automatic live truth.
- Many organisations use **town-centre** coordinates until field/official verification.

## Automated controls

| Control | Behaviour |
|---------|-----------|
| Public pages | Only `PUBLISHED` / `VERIFIED` locations; only `PUBLISHED` orgs |
| `ENFORCE_COORD_QUALITY=1` | Blocks publish unless coordQuality is `verified` or `estimated` |
| `verificationExpiresAt` | Dashboard counts `expiredVerify`; flag “review due” on profiles |
| Evidence | `evidenceJson` + `SourceRecord` required procedurally (enforce in admin UI) |

## Workflows not in UI yet (schema ready)

- Bulk import staging / preview approval (`CorrectionRequest`, future `ImportBatch`)
- Duplicate matching (name+province fuzzy) — run offline before merge
- Data owner confirm/dispute via `CorrectionRequest`
- DSAR via `DataSubjectRequest`
- Quality score = weighted: status + coordQuality + evidence presence + expiry

## Completeness metrics

Dashboard exposes: total, published, verified, draft, expiredVerify, townCentreCoords, by province / category.
