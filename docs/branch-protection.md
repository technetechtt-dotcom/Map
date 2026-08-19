# Branch protection (required for `main`)

CI must be green before merge. Repository admins should enable these GitHub settings and **must not allow administrator bypass** in production.

## Required status checks

1. **Settings → Branches → Add rule** (or Ruleset) for `main`
2. Require a pull request before merging (1 approval)
3. Require status checks to pass:
   - `test-and-build`
   - `postgres-postgis`
   - `secret-scan` (Security workflow)
   - `codeql`
   - `dependency-audit-sbom`
   - `license-check`
   - `dependency-review` (pull requests)
4. Require branches to be up to date
5. Do not allow bypassing for administrators
6. Restrict force pushes and deletions

## CODEOWNERS

`.github/CODEOWNERS` requests review on auth, policy, Prisma, and workflows.

Apply via GitHub UI or:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=test-and-build' \
  -F 'required_status_checks.contexts[]=postgres-postgis' \
  -F 'required_status_checks.contexts[]=secret-scan' \
  -F 'required_status_checks.contexts[]=codeql' \
  -F 'required_status_checks.contexts[]=dependency-audit-sbom' \
  -F 'required_status_checks.contexts[]=license-check' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions= \
  -F allow_force_pushes=false
```
