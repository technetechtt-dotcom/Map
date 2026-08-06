# Privacy notice & POPIA / PAIA alignment (South Africa)

This document defines the baseline governance model for personal information processed by the SA ICT Ecosystem Map. Legal review is required before production go-live.

## Lawful bases (draft)

| Data | Lawful basis | Purpose |
|------|--------------|---------|
| Account email / name | Contract / legitimate interest | Administrator login & accountability |
| Community submitter name/email | Consent | Process listing proposals |
| Organisation public contact email/phone | Legitimate interest / public interest | ICT ecosystem directory |
| Analytics IP (sampled) | Legitimate interest | Service security & usage |
| Audit log IP | Legal obligation / security | Security monitoring |

## Public notice (site should link `/privacy`)

- We collect contact details you supply on submission forms with your consent.
- Published directory data is intended for innovation ecosystem discovery.
- Province administrators see **only** submissions and audits for their province.
- You may request access, correction or deletion via the data-subject request process.

## Data subject workflows

| Request | Channel | SLA (target) |
|---------|---------|--------------|
| Access (s23 PAIA/POPIA) | `DataSubjectRequest` type=access or email dpo@ | 30 days |
| Correction | `CorrectionRequest` + DSAR | 30 days |
| Deletion / withdraw consent | DSAR type=deletion / withdraw_consent | 30 days |

API placeholders: store requests in `DataSubjectRequest` / `CorrectionRequest` (admin review queue).

## Retention

| Store | Default retention |
|-------|-------------------|
| Analytics events | 90 days (`pruneAnalytics`) |
| High-volume audit actions | 365 days pruning for search/view |
| Backups | `BACKUP_RETENTION_DAYS` (default 30) + max keep |
| Password reset tokens | 1 hour |
| Admin invitations | 7 days |

## Controllers

- **National platform operator**: overall operator / hosting authority (define per MoU).
- **Provincial departments**: responsible for their province-scoped personal data and verification decisions.
- **Organisations**: responsible for accuracy of their contact listings.

## Cross-province access

Only `SUPER_ADMIN` may access all provinces. Provincial admins are hard-scoped by `provinceId`.

## Breach response (summary)

1. Contain & preserve logs  
2. Assess risk to data subjects within 72 hours  
3. Notify Information Regulator / subjects when required  
4. Post-incident review + access recertification  

## Role access review

Recertify admin accounts quarterly; disable after 90 days inactivity; record in audit.

## Cookies / analytics

Session cookies for authentication only. Analytics are server-side sampled events (no advertising cookies by default).

## Backup POPIA notes

Encrypted backups may contain personal info. Off-site backup access is super-admin only. Deletion/retention governed by `BACKUP_RETENTION_DAYS`.
