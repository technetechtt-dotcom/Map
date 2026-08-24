#!/usr/bin/env node
/**
 * Post-deploy smoke: live → privileged readiness SHA → search/map.
 * Exits 1 when the deployed origin is not the certified commit.
 */
const base = (process.env.PRODUCTION_APP_URL || process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const expectedSha = process.env.CERTIFIED_SHA || process.env.GITHUB_SHA || "";
const token = process.env.METRICS_TOKEN || process.env.CRON_SECRET || "";

async function get(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

async function main() {
  if (!base) {
    console.error("PRODUCTION_APP_URL is required for post-deploy verification");
    process.exit(1);
  }
  if (!expectedSha) {
    console.error("CERTIFIED_SHA is required and must be non-null");
    process.exit(1);
  }
  if (!token) {
    console.error("METRICS_TOKEN or CRON_SECRET is required to read the deployed SHA");
    process.exit(1);
  }
  const live = await get("/api/health/live");
  if (!live.res.ok || live.json?.status !== "ok") throw new Error(`health live ${live.res.status}`);

  const headers = { "x-metrics-token": token, authorization: `Bearer ${token}` };
  const ready = await get("/api/health", headers);
  if (!ready.res.ok) throw new Error(`health ${ready.res.status}`);
  if (!ready.json?.sha) throw new Error("deployed SHA is missing");
  if (ready.json.sha !== expectedSha) {
    throw new Error(`deployed sha ${ready.json.sha} != certified ${expectedSha}`);
  }
  if (ready.json?.db === "error") throw new Error("database not ready");

  const search = await get("/api/search?q=digital%20skills&limit=5");
  if (!search.res.ok) throw new Error(`search ${search.res.status}`);
  const locations = await get("/api/locations?limit=20");
  if (!locations.res.ok) throw new Error(`locations ${locations.res.status}`);

  console.log(JSON.stringify({
    ok: true,
    origin: base,
    sha: ready.json?.sha || null,
    certified: expectedSha || null,
    db: ready.json?.db || "public",
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
