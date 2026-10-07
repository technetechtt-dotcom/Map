# Performance evidence

k6 profiles live in `scripts/performance/k6-national.js` (`ci`, `250`, `500`, `1000`, `spike`, `endurance`). They run against **isolated PostGIS in CI**, never production Neon.

Each formal run should retain:

- release SHA
- VU profile and dataset size
- p50/p95/p99 and request failure rate
- notes on DB connections/memory if observed

`scripts/performance/record-evidence.js` writes `data/performance-evidence.json` from k6 JSON output. Authenticated/write/pool scripts are additional CI jobs on the same isolated app, not a production soak.

## Provenance (load-test.yml only)

Do not cite ordinary CI (`test-and-build`) or Security workflow run IDs as performance evidence.

The last successful **Production-scale load** run is:

| Field | Value |
| --- | --- |
| Workflow | Production-scale load (`load-test.yml`) |
| Run | [`#36998379576`](https://github.com/technetechtt-dotcom/Map/actions/runs/36998379576) |
| Artifact | `performance-evidence` id `11222792312` |
| SHA | `435483ceab236f24bd3061fa68a87e3d0b32d174` |
| Profile | `ci` (push event default; not the 250 / 500 / 1000 VU ladder) |
| Dataset | `SCALE_LOCATIONS` default 800 |

The 250 / 500 / 1000 VU ladder is `workflow_dispatch` with profile `1000` on that same workflow. It has not been attached as certified evidence for later SHAs. Raw pointer: `data/performance-evidence.json`.

## How to recertify the VU ladder

```bash
gh workflow run load-test.yml --ref main -f profile=1000 -f locations=5000
```

Archive the resulting `performance-evidence` artifact run ID next to the release SHA.
