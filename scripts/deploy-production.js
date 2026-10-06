#!/usr/bin/env node
/**
 * Deploy the certified SHA and prove the live origin matches it.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const preflight = spawnSync(process.execPath, [path.join(__dirname, "ops-preflight.js"), "deploy"], {
  stdio: "inherit",
  env: process.env,
});
if (preflight.status !== 0) process.exit(preflight.status || 1);

const sha = process.env.CERTIFIED_SHA || process.env.GITHUB_SHA || "";
const hook = process.env.PRODUCTION_DEPLOY_HOOK || "";
const vercelToken = process.env.VERCEL_TOKEN || "";
const vercelOrg = process.env.VERCEL_ORG_ID || "";
const vercelProject = process.env.VERCEL_PROJECT_ID || "";
const appUrl = (process.env.PRODUCTION_APP_URL || "").replace(/\/$/, "");

if (!sha) {
  console.error("CERTIFIED_SHA is required");
  process.exit(1);
}

async function vercelMeta() {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(vercelProject)}&limit=5&target=production`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`vercel deployments ${res.status}`);
  const json = await res.json();
  const rows = json.deployments || json;
  const match = (Array.isArray(rows) ? rows : []).find((row) => {
    const commit = row.meta?.githubCommitSha || row.meta?.githubCommitRef || row.gitSource?.sha;
    return commit === sha;
  });
  return match || (Array.isArray(rows) ? rows[0] : null);
}

async function rollback() {
  if (!vercelToken || !vercelProject) return;
  try {
    const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(vercelProject)}&limit=10&target=production&state=READY`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    const previous = (json.deployments || []).find((row) => (row.meta?.githubCommitSha || row.gitSource?.sha) !== sha);
    if (!previous?.uid) return;
    spawnSync("npx", ["vercel", "promote", previous.uid, "--yes", "--token", vercelToken], { stdio: "inherit" });
  } catch (error) {
    console.error("rollback failed", error instanceof Error ? error.message : error);
  }
}

async function main() {
  if (vercelToken && vercelOrg && vercelProject) {
    const deploy = spawnSync("npx", ["vercel", "deploy", "--prod", "--yes", "--token", vercelToken], {
      stdio: "inherit",
      env: {
        ...process.env,
        VERCEL_ORG_ID: vercelOrg,
        VERCEL_PROJECT_ID: vercelProject,
        GIT_COMMIT: sha,
        GITHUB_SHA: sha,
      },
    });
    if (deploy.status !== 0) process.exit(deploy.status || 1);
    const meta = await vercelMeta();
    const deployed = meta?.meta?.githubCommitSha || meta?.gitSource?.sha || "";
    if (deployed && deployed !== sha) {
      console.error(`Vercel production SHA ${deployed} does not match certified ${sha}`);
      await rollback();
      process.exit(1);
    }
  } else if (hook) {
    let deployUrl = hook;
    if (sha && !deployUrl.includes("ref=")) {
      const sep = deployUrl.includes("?") ? "&" : "?";
      deployUrl = `${deployUrl}${sep}ref=${encodeURIComponent(sha)}`;
    }
    const res = await fetch(deployUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha, ref: sha }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const errorMsg = `deploy hook responded with HTTP ${res.status}: ${body || "(empty)"}. Ensure PRODUCTION_DEPLOY_HOOK and OPS_DEPLOY_HOOK match real Render service hook URLs.`;
      // If deploy hook returns 404 (e.g. stale/regenerated hook URL on Render), check whether target origin is already live and healthy
      if (res.status === 404 && appUrl) {
        console.warn(`[deploy-warning] ${errorMsg}`);
        console.warn(`[deploy-warning] Checking if ${appUrl} is already reachable and live...`);
        const liveRes = await fetch(`${appUrl.replace(/\/$/, "")}/api/health/live`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (liveRes && liveRes.ok) {
          console.warn(`[deploy-warning] ${appUrl} is alive. Proceeding to post-deploy SHA verification.`);
        } else {
          throw new Error(errorMsg);
        }
      } else {
        throw new Error(errorMsg);
      }
    }
  } else if (process.env.RENDER_API_KEY && (process.env.RENDER_SERVICE_ID || process.env.RENDER_PRODUCTION_SERVICE_ID)) {
    const serviceId = process.env.RENDER_SERVICE_ID || process.env.RENDER_PRODUCTION_SERVICE_ID;
    const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clearCache: "do_not_clear" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Render API deploy failed with status ${res.status}`);
  } else {
    console.error(
      "Set Vercel deploy tokens, deploy hooks (PRODUCTION_DEPLOY_HOOK + OPS_DEPLOY_HOOK), or Render API credentials (RENDER_API_KEY + service IDs)"
    );
    process.exit(1);
  }

  if (!appUrl) {
    console.error("PRODUCTION_APP_URL is required so the workflow can prove the live SHA");
    process.exit(1);
  }

  for (let i = 0; i < 18; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const verify = spawnSync(process.execPath, [require("path").join(__dirname, "post-deploy-verify.js")], {
      stdio: "inherit",
      env: { ...process.env, PRODUCTION_APP_URL: appUrl, CERTIFIED_SHA: sha },
    });
    if (verify.status === 0) {
      console.log(JSON.stringify({ ok: true, sha }));
      return;
    }
  }
  await rollback();
  console.error("Post-deploy verification failed");
  process.exit(1);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await rollback();
  process.exit(1);
});
