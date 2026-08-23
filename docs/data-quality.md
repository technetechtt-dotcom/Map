# Data quality & national readiness

## Live dataset reality

- Primary published locations are **9** Northern Cape presentation towns (desktop-verified) plus **30** national directory pins.
- **49** PDF organisations sit in the directory.
- `data/NC_ICT_Locations_Full.csv` is **candidate** inventory — not automatic live truth. Do not claim 100+ locations.
- Many organisations use **town-centre** coordinates until field/official verification.

## Automated controls

| Control | Behaviour |
|---------|-----------|
| Public pages | Only `PUBLISHED` / `VERIFIED` locations; only `PUBLISHED` orgs |
| `ENFORCE_COORD_QUALITY=1` | Blocks publish unless coordQuality is `verified` or `estimated` |
| `verificationExpiresAt` | Dashboard counts `expiredVerify`; flag “review due” on profiles |
| Evidence | `evidenceJson` + `SourceRecord` required procedurally (enforce in admin UI) |
| Import staging | `/admin/imports` + `ImportBatch` — dry-run duplicates, apply as DRAFT only |
| Duplicate check | Name Jaccard + 250 m proximity in import report (`src/lib/duplicates.ts`) |

## Workflows

- Bulk import staging / preview / apply (`ImportBatch`, admin UI)
- Data owner confirm/dispute via `CorrectionRequest`
- DSAR via `DataSubjectRequest`
- Quality score = weighted: status + coordQuality + evidence presence + expiry

## Completeness metrics

Dashboard exposes: total, published, verified, draft, expiredVerify, townCentreCoords, by province / category.
