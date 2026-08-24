# 10-minute demo script

Product name: **SA ICT Ecosystem Map**. Position: Northern Cape is the curated pilot; the other eight provinces are a directory scaffold.

Do **not** claim 100+ locations. Live seed is **9 NC towns + 49 organisations + 30 national pins**.

Prep: seed with `SEED_ADMIN_PASSWORD` (min 12). For a local walkthrough also set `ALLOW_DEMO_USERS=1` and `NEXT_PUBLIC_DEMO_HINTS=1`. Sign-in emails are `admin@ictmap.gov.za` (super) and `nc.admin@ictmap.gov.za` (provincial). Password is never logged.

Stay off Users, Import staging, and contributor Submissions. Those sit under **Advanced**.

| Min | Screen | Say this |
|-----|--------|----------|
| 0–1 | `/about` | Problem: no shared, governed map of ICT assets. This is the public one-pager. Print it as the leave-behind. |
| 1–3 | `/` then Kimberley | Nine sourced Northern Cape towns. Set **Verification** to Current (desktop + field) — desktop-reviewed pins stay; expired and directory pins drop. |
| 3–5 | `/organisations` then one `/org/…` | Forty-nine PDF-backed contacts. Provenance is on the page. |
| 5–6 | `/national` | Nine provinces online. Depth is NC; the rest is scaffold so tenancy already works. |
| 6–8 | Sign in super → `/admin/locations` | Draft → verify → publish. Provincial admin only sees Northern Cape. |
| 8–10 | `/admin/ops` | Health, queues, backups, jobs. This is runnable infrastructure, not a mock. |

If asked about scale: candidate CSV rows are research only and are not live. National depth follows official ingestion.

If asked about TAM or the raise: that lives on the investor deck, not in `/dashboard`.
