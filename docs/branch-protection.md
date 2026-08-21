# Branch protection (`main`)

This repository **pushes commits directly to `main`**. Pull requests are not required.

Keep these GitHub settings:

1. **Do not** require a pull request before merging
2. **Do not** require status checks to pass before push (CI still runs on `main` after push)
3. Restrict force pushes and deletions
4. Do not allow bypassing those restrictions

CI still runs on every push to `main` (`test-and-build`, `postgres-postgis`, `secret-scan`, `codeql`, `dependency-audit-sbom`, `license-check`). Treat a red run on `main` as a production incident and fix it with another commit on `main`.

## CODEOWNERS

`.github/CODEOWNERS` still documents owners for auth, policy, Prisma, and workflows. It does not gate pushes.

Apply via GitHub UI or:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  --input docs/branch-protection.json
```
