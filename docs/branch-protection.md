# Branch protection (`main`)

This repository previously pushed commits directly to `main`. Launch governance
now requires reviewed pull requests, CODEOWNERS approval, and verified signatures.

Keep these GitHub settings:

1. Require a pull request with at least one approval and approval of the last push
2. Require status checks `test-and-build`, `postgres-postgis`, `secret-scan`, `codeql`, `dependency-audit-sbom`, and `license-check` when a pull request is used
3. **Enforce the same checks for administrators** (`enforce_admins: true`)
4. Restrict force pushes and deletions
5. Require signed commits and the active `v*` tag ruleset

Required status checks do not stop a direct push from landing on `main`. Production exposure is blocked by the **Production deploy** workflow: it must deploy a certified SHA, prove a non-null live SHA matches `CERTIFIED_SHA`, and smoke the live origin. A red SHA is not promoted.

`docs/branch-protection-launch.json` is the branch policy and
`docs/tag-protection-launch.json` is the release-tag policy. The tag workflow also
rejects lightweight or unverified annotated `v*` tags.

Apply the live settings via:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection \
  --input docs/branch-protection.json
```

## Signed release governance (launch gate)

When the repo switches to PR-based flow, apply `docs/branch-protection-launch.json`:

```bash
node scripts/apply-launch-governance.js
```

This requires:
- Required PR reviews with CODEOWNERS
- Signed commits (`required_signatures: true`)
- Protected production Environment with required reviewers
- No routine unsigned direct pushes to `main`

Until then, the commit-signature-check workflow (`commit-signature-check.yml`) scans PRs for unsigned commits and blocks merge.
