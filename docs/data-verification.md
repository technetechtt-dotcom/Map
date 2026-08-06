# Data reconciliation notes (P2)

## Claimed vs actual catalogue size

| Source | Count | Reality |
|--------|------:|---------|
| Presentation PDF towns (seed locations) | ~9–15 | **Active published/curated set** for the map MVP |
| PDF organisations / contacts | ~49 | Directory + hub pins; many use **town-centre** coordinates |
| `data/NC_ICT_Locations_Full.csv` | 100+ | Historical/curated **candidate** list — not automatically loaded as live DB truth |

Public marketing copy must not claim “100+ verified pins” unless the seeded Location table count matches after a full import + verification cycle.

## Verification workflow fields

On `Location`:

- `status`: DRAFT → PENDING_REVIEW → VERIFIED → PUBLISHED (org/contributor stop at PENDING_REVIEW)
- `lastVerifiedAt`, `reviewedById`, `verificationSource`, `verificationNotes`
- `verificationExpiresAt` — re-review due date (seed uses +12 months for PDF-checked rows)
- `coordQuality`: `verified` | `estimated` | `town-centre` | `unknown`
- `coordSource` — how the coordinate was obtained
- `evidenceJson` — supporting evidence list (document refs, URLs, dates)
- Related `SourceRecord` rows for formal evidence capture

## Coordinate policy

Organisation pins with `coordQuality` of `town-centre` or `estimated` should be upgraded after:

1. Responsible official / provincial desk confirms site address
2. Physical coordinate captured (±30 m preferred)
3. Evidence reference + new `verificationExpiresAt` set
4. Status verified/published only by `PROVINCIAL_ADMIN` or `SUPER_ADMIN`
