#!/usr/bin/env node
/**
 * After Render services are live, wire GitHub production secrets + smoke health.
 * Usage:
 *   node scripts/finish-render-connect.js <publicUrl> <opsUrl> [deployHook]
 */
const { spawnSync } = require("child_process");

const publicUrl = (process.argv[2] || "").replace(/\/$/, "");
const opsUrl = (process.argv[3] || "").replace(/\/$/, "");
const deployHook = process.argv[4] || "";

if (!publicUrl || !opsUrl || !/^https:\/\//i.test(publicUrl) || !/^https:\/\//i.test(opsUrl)) {
  console.error("Usage: node scripts/finish-render-connect.js <publicHttpsUrl> <opsHttpsUrl> [deployHook]");
  process.exit(1);
}

function setSecret(name, value) {
  if (!value) return;
  const r = spawnSync("gh", ["secret", "set", name, "--env", "production"], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
  });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log(`set ${name}`);
}

setSecret("PRODUCTION_APP_URL", publicUrl);
setSecret("OPS_APP_URL", opsUrl);
if (deployHook) setSecret("PRODUCTION_DEPLOY_HOOK", deployHook);

async function smoke(url) {
  const live = `${url}/api/health/live`;
  const res = await fetch(live, { signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  return { url: live, status: res.status, ok: res.ok, body: text.slice(0, 200) };
}

(async () => {
  const results = [];
  for (const url of [publicUrl, opsUrl]) {
    try {
      results.push(await smoke(url));
    } catch (error) {
      results.push({ url: `${url}/api/health/live`, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const ok = results.every((r) => r.ok);
  console.log(JSON.stringify({ ok, secrets: ["PRODUCTION_APP_URL", "OPS_APP_URL", deployHook ? "PRODUCTION_DEPLOY_HOOK" : null].filter(Boolean), health: results }, null, 2));
  process.exit(ok ? 0 : 1);
})();
