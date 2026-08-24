# Demo logins (non-production)

Two seeded accounts share one password from `SEED_ADMIN_PASSWORD` (min 12 characters).

| Role | Default email | Scope |
|------|---------------|--------|
| Super admin | `admin@ictmap.gov.za` | All provinces, operations, backups |
| Provincial admin | `nc.admin@ictmap.gov.za` | Northern Cape only |

Override emails with `SEED_ADMIN_EMAIL` and `SEED_NC_ADMIN_EMAIL`. If you change them, set `NEXT_PUBLIC_DEMO_SUPER_EMAIL` and `NEXT_PUBLIC_DEMO_PROVINCIAL_EMAIL` so the login hints match.

Local presentation only:

```
ALLOW_DEMO_USERS=1
NEXT_PUBLIC_DEMO_HINTS=1
SEED_ADMIN_PASSWORD=<your 12+ character password>
```

`ALLOW_DEMO_USERS` is ignored in production. Never commit passwords or enable demo hints on a public host.

Walkthrough: `/about` → map (Current verification tier) → contacts → `/national` → `/admin/locations` → `/admin/ops`. Hide Advanced (users, imports, backups) unless asked.
