# Branch protection (`main`)

`main` requires a pull request with one approving review. Required GitHub Actions checks must be green, and the branch must be up to date with `main` before merge.

Keep these GitHub settings:

1. Require a pull request before merging
2. Require one approving review and dismiss stale reviews
3. Require status checks: `test-and-build`, `postgres-postgis`, `secret-scan`, `codeql`, `dependency-audit-sbom`, `license-check`
4. Require branches to be up to date before merging
5. Restrict force pushes and deletions
6. Include administrators (no admin bypass)

Apply via GitHub UI or:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  --input docs/branch-protection.json
```
