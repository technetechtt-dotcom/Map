#!/usr/bin/env node
/**
 * Post-deploy smoke: live SHA (public) → optional privileged readiness → search/map.
 * Missing or mismatched deployed SHA is fatal.
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
  const live = await get("/api/health/live");
  if (!live.res.ok || live.json?.status !== "ok") throw new Error(`health live ${live.res.status}`);

  let deployedSha = live.json?.sha || null;
  let db = "public";
  if (token) {
    const headers = { "x-metrics-token": token, authorization: `Bearer ${token}` };
    const ready = await get("/api/health", headers);
    if (!ready.res.ok) throw new Error(`health ${ready.res.status}`);
    deployedSha = ready.json?.sha || deployedSha;
    if (ready.json?.db === "error") throw new Error("database not ready");
    if (ready.json?.db) db = ready.json.db;
  }
  if (!deployedSha) {
    throw new Error("deployed SHA is missing");
  }
  if (deployedSha !== expectedSha) {
    throw new Error(`deployed sha ${deployedSha} != certified ${expectedSha}`);
  }

  const search = await get("/api/search?q=digital%20skills&limit=5");
  if (!search.res.ok) throw new Error(`search ${search.res.status}`);
  const locations = await get("/api/locations?limit=20");
  if (!locations.res.ok) throw new Error(`locations ${locations.res.status}`);

  console.log(JSON.stringify({
    ok: true,
    origin: base,
    sha: deployedSha,
    certified: expectedSha,
    db,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
