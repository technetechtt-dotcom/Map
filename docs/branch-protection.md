# Branch protection (required for `main`)

CI must be green before merge. Repository admins should enable these GitHub settings:

## Required

1. **Settings → Branches → Add rule** for `main`
2. Require a pull request before merging (1 approval)
3. Require status checks to pass:
   - `test-and-build`
   - `postgres-postgis`
4. Require branches to be up to date
5. Do not allow bypassing for administrators in production orgs
6. Restrict force pushes and deletions

## CODEOWNERS

`.github/CODEOWNERS` requests review on auth, policy, Prisma, and workflows.

## Dependabot

Major upgrades for Next, React, Prisma, and eslint-config-next are ignored so they land on dedicated branches (see `docs/next15-upgrade.md`). Security patches on the current major still open.

Apply via GitHub UI or:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=test-and-build' \
  -F 'required_status_checks.contexts[]=postgres-postgis' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions= \
  -F allow_force_pushes=false
```
