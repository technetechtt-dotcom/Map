# Source authority and conflict resolution

When sources disagree, higher authority wins **per field**. A directory may add a missing website; it may not overwrite a desktop/field value.

| Rank | Class | Examples |
| ---: | --- | --- |
| 100 | Field reviewer | On-site verification |
| 80 | Desktop reviewer | Provincial/super admin verification |
| 70 | Government | Provincial departments, municipalities, procurement |
| 60 | Institutional | Universities, TVETs, SETAs, research orgs, hubs |
| 50 | Organisation self-asserted | Claimed profile updates |
| 30 | Community | Public submissions |
| 10 | Directory | Scraped/open directories and company lists |

Verified records also freeze **canonical identity**. Incoming directory coordinates are not used to recompute `canonicalKey` when the stored tier is desktop or field.

External IDs are connector-scoped (`ExternalIdentity`). Global `Location.externalId` lookup is not used for matching.

Unchanged rows still record `SourceObservation.lastSeenAt` so “not changed” is distinct from “not checked.” After consecutive misses the record is marked missing-from-source, queued for review, and only later archived — never deleted by ingestion.
