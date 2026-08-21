# Branch protection (`main`)

This repository **pushes commits directly to `main`**. Pull requests are not required.

Keep these GitHub settings:

1. **Do not** require a pull request before merging
2. Require status checks `test-and-build`, `postgres-postgis`, `secret-scan`, and `codeql` when a pull request is used
3. Restrict force pushes and deletions
4. Do not allow bypassing those restrictions
5. Do **not** yet require signed commits (the current push path is unsigned)

Required status checks do not stop a direct push from landing on `main`. Production exposure is blocked by the **Production deploy** workflow: it must deploy a certified SHA, prove `deployedCommit == certifiedCommit`, and smoke the live origin. A red SHA is not promoted.

Signed commits remain a follow-up once the operator push path has GPG/SSH signing.

Apply via GitHub UI or:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  --input docs/branch-protection.json
```
