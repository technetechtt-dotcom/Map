# 10-minute investor demo script

Product name: **SA ICT Ecosystem Map**.

Position the product as **governed national ICT ecosystem intelligence**, not only a map. Northern Cape is the curated depth pilot; the other eight provinces demonstrate the national tenancy and ingestion architecture.

## Demo safety rules

- Use the public application for the investor story, then switch to the separate ops console for governance.
- Keep **Advanced** administration hidden unless an investor specifically asks.
- Do not open the Backup panel as part of the main pitch unless the current release certification shows backup health green.
- Do not make claims from candidate/research-only CSV rows. Use published catalogue counts shown by the product.
- Only call the demonstrated build "production-certified" when CI, Security, staging and the controlled deployment gate are green for the exact live SHA.

## Preparation

Seed with `SEED_ADMIN_PASSWORD` (minimum 12 characters). For a local walkthrough also set:

```
ALLOW_DEMO_USERS=1
NEXT_PUBLIC_DEMO_HINTS=1
```

Demo accounts:

- Super admin: `admin@ictmap.gov.za`
- Provincial admin: `nc.admin@ictmap.gov.za`

The password must never be logged, committed or displayed publicly.

## 10-minute flow

| Min | Screen | Investor story |
|---|---|---|
| 0–1 | `/about` | The problem: South Africa has fragmented ICT ecosystem information. The platform creates a governed, shared intelligence layer. |
| 1–3 | `/` | Show the interactive national map, Northern Cape depth, filters and verification controls. Explain the distinction between published, desktop-verified and field-verified information. |
| 3–4 | `/organisations` → one `/org/…` | Show organisation profiles, contacts, capabilities, linked locations, provenance and ecosystem relationships. |
| 4–5 | `/search` | Search across organisations, locations, funding, programmes, events and procurement from one interface. |
| 5–6 | `/national` | Show national coverage and province comparison. Explain that the same governance model scales across all nine provinces. |
| 6–7 | `/funding` or `/procurement` | Show that the product is also an opportunity-discovery layer, not merely a directory. |
| 7–9 | Sign in super admin → `/admin/locations` | Demonstrate governed lifecycle: draft → review/verification → publish. Explain province-scoped administration. |
| 9–10 | `/admin/intelligence` | Finish on decision intelligence: catalogue quality, province comparison, coverage gaps, connector health and opportunity activity. |

## Optional technical proof

If asked how the platform stays current, show `/data-sources` and explain scheduled ingestion, source provenance, connector health and human review.

If asked about platform operations, open `/admin/ops` only after confirming its visible health indicators are green for the current environment.

If asked about scale, explain that national source depth expands through authoritative connectors and governed submissions; do not present research candidates as live verified records.

If asked about TAM, business model, raise or financial projections, use the investor deck rather than the operational dashboard.
