# Signed release governance

Direct pushes to `main` were used during MVP hardening. Transition to signed, reviewable releases as launch gates close.

## Target protection

Apply `docs/branch-protection-launch.json`:

- Required CI status checks (unchanged)
- Required pull request review (1 approval)
- Required signed commits on `main`
- No force pushes; enforce admins

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input docs/branch-protection-launch.json
```

## Developer setup

```bash
git config commit.gpgsign true
gpg --list-secret-keys
gh auth status
```

## Release flow (after transition)

1. Branch from `main`, implement, push signed commits
2. Open PR — CI + Security must pass
3. Merge with signed merge commit
4. `Production deploy` workflow certifies merged SHA
5. Tag release: `git tag -s v1.4.0 -m "Release v1.4.0"` && `git push origin v1.4.0`

## CI enforcement

`.github/workflows/commit-signature-check.yml` fails PRs that contain unsigned commits.

## Exception process

Break-glass hotfix: super-admin temporarily relaxes protection using `docs/branch-protection.json`, pushes signed fix, restores launch protection immediately. Document in change ticket.
