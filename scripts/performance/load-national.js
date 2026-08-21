#!/usr/bin/env node
/**
 * CI-friendly national load suite. Use k6 (`npm run load:k6`) for the full ramping profile.
 */
const base = (process.env.BASE_URL || process.env.STAGING_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const profiles = {
  ci: { concurrency: 4, loops: 4 },
  national: { concurrency: 20, loops: 10 },
  250: { concurrency: 40, loops: 8 },
  500: { concurrency: 60, loops: 8 },
  1000: { concurrency: 80, loops: 8 },
  endurance: { concurrency: 20, loops: 40 },
  spike: { concurrency: 50, loops: 4 },
};
const profile = profiles[process.env.LOAD_PROFILE || "national"] || profiles.national;

const paths = [
  "/api/health/live",
  "/api/health",
  "/api/locations?province=northern-cape&limit=200",
  "/api/locations?province=western-cape&limit=200",
  "/api/locations?province=gauteng&limit=200",
  "/api/locations?lat=-28.738&lng=24.763&radiusKm=100&limit=200",
  "/api/search?q=digital%20skills&limit=20",
  "/api/locations/clusters?bounds=16,-35,33,-22&zoom=6",
];

async function hit(path) {
  const started = Date.now();
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) });
  return { path, status: res.status, ms: Date.now() - started, ok: res.ok };
}

async function worker(id) {
  const samples = [];
  for (let i = 0; i < profile.loops; i += 1) {
    for (const path of paths) samples.push(await hit(path));
  }
  return samples;
}

async function main() {
  const batches = await Promise.all(Array.from({ length: profile.concurrency }, (_, i) => worker(i)));
  const samples = batches.flat();
  const failed = samples.filter((row) => !row.ok);
  const times = samples.map((row) => row.ms).sort((a, b) => a - b);
  const report = {
    base,
    profile,
    requests: samples.length,
    failed: failed.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times[times.length - 1],
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length / samples.length > 0.02) {
    console.error("national load suite exceeded 2% error rate");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
