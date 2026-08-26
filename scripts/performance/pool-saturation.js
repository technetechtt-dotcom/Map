#!/usr/bin/env node
/**
 * Concurrent public reads to expose pool saturation on isolated PostGIS.
 */
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const concurrency = Number(process.env.POOL_CONCURRENCY || 40);
const paths = ["/api/health/live", "/api/locations?province=northern-cape&limit=50", "/api/organisations?limit=20", "/api/search?q=digital"];

async function main() {
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, async (_, i) => {
      const url = `${base}${paths[i % paths.length]}`;
      try {
        const res = await fetch(url);
        return res.status;
      } catch {
        return 0;
      }
    })
  );
  const failed = results.filter((status) => status === 0 || status >= 500).length;
  const report = { concurrency, failed, elapsedMs: Date.now() - started, statuses: results.slice(0, 10) };
  console.log(JSON.stringify(report));
  if (failed > concurrency * 0.1) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
