# Data reconciliation notes (P2)

## Claimed vs actual catalogue size

| Source | Count | Reality |
|--------|------:|---------|
| Presentation PDF towns (seed locations) | **9** | Active curated set. Desktop-verified (`lastVerifiedAt` = 2026-08-21, expires 2027-08-21). Town-centre coordinates, not field surveys. |
| PDF organisations / contacts | **49** | Directory + hub pins; many use **town-centre** coordinates |
| National public directory | **30** | Scaffold pins across nine provinces. `lastVerifiedAt` is null. |
| Candidate spreadsheet | 100+ | Research list only — **not** live map truth |

Public marketing copy must not claim “100+ verified pins.” Live seed is 9 + 49 + 30.

## Verification workflow fields

On `Location`:

- `verificationTier`: `unverified` | `directory` | `desktop` | `field`
- `status`: DRAFT → PENDING_REVIEW → VERIFIED → PUBLISHED (org/contributor stop at PENDING_REVIEW)
- `lastVerifiedAt`, `reviewedById`, `verificationSource`, `verificationNotes`
- `verificationExpiresAt` — re-review due date (curated NC towns expire 2027-08-21)
- Map/API `verified=1` is an alias for **current** (not expired) desktop + field rows
- `coordQuality`: `verified` | `estimated` | `town-centre` | `directory-only` | `unknown`
- `canonicalKey` — entity resolution key used before ingest upsert
- `coordSource` — how the coordinate was obtained
- `evidenceJson` — supporting evidence list (document refs, URLs, dates)
- Related `SourceRecord` rows (`connector`, `retrievedAt`, `licence`) and `IngestionChange` history

## Coordinate policy

Organisation pins with `coordQuality` of `town-centre` or `estimated` should be upgraded after:

1. Responsible official / provincial desk confirms site address
2. Physical coordinate captured (±30 m preferred)
3. Evidence reference + new `verificationExpiresAt` set
4. Status verified/published only by `PROVINCIAL_ADMIN` or `SUPER_ADMIN`
