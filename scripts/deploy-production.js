#!/usr/bin/env node
/**
 * Deploy the certified SHA and prove the live origin matches it.
 * Invalid deploy-hook HTTP status (including 404) is fatal — never continue because origin health is 200.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const preflight = spawnSync(process.execPath, [path.join(__dirname, "ops-preflight.js"), "deploy"], {
  stdio: "inherit",
  env: process.env,
});
if (preflight.status !== 0) process.exit(preflight.status || 1);

const sha = process.env.CERTIFIED_SHA || process.env.GITHUB_SHA || "";
const hook = (process.env.PRODUCTION_DEPLOY_HOOK || "").trim();
const vercelToken = process.env.VERCEL_TOKEN || "";
const vercelOrg = process.env.VERCEL_ORG_ID || "";
const vercelProject = process.env.VERCEL_PROJECT_ID || "";
const appUrl = (process.env.PRODUCTION_APP_URL || "").replace(/\/$/, "");

if (!sha) {
  console.error("CERTIFIED_SHA is required");
  process.exit(1);
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function platformNeedle() {
  return (process.env.APP_PLATFORM || "public") === "ops" ? "sa-ict-map-ops" : "sa-ict-map-public";
}

function expectedServiceId() {
  return (
    process.env.RENDER_SERVICE_ID ||
    ((process.env.APP_PLATFORM || "public") === "ops"
      ? process.env.RENDER_OPS_SERVICE_ID
      : process.env.RENDER_PRODUCTION_SERVICE_ID) ||
    ""
  );
}

async function waitForGithubRenderDeploy(certifiedSha) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token || !certifiedSha) return false;
  const needle = platformNeedle();
  const serviceId = expectedServiceId();
  for (let i = 0; i < 40; i += 1) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/deployments?sha=${encodeURIComponent(certifiedSha)}&per_page=30`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(15000) }
    );
    if (res.ok) {
      const rows = await res.json();
      const match = (Array.isArray(rows) ? rows : []).find((row) => String(row.environment || "").includes(needle));
      if (match?.statuses_url) {
        const st = await fetch(match.statuses_url, { headers: githubHeaders(), signal: AbortSignal.timeout(15000) });
        if (st.ok) {
          const statuses = await st.json();
          const latest = Array.isArray(statuses) ? statuses[0] : null;
          const blob = JSON.stringify(statuses);
          const serviceOk = !serviceId || blob.includes(serviceId);
          if (latest?.state === "success" && serviceOk) return true;
          if (latest?.state === "failure" || latest?.state === "error") {
            throw new Error(`Render GitHub deployment ${match.environment} failed for ${certifiedSha}`);
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  return false;
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

async function triggerRenderApi() {
  const serviceId = expectedServiceId();
  if (!process.env.RENDER_API_KEY || !serviceId) return false;
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
  return true;
}

async function triggerHook() {
  if (!hook) return false;
  const res = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ clearCache: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `deploy hook responded with HTTP ${res.status}: ${body || "(empty)"}. Replace PRODUCTION_DEPLOY_HOOK and OPS_DEPLOY_HOOK with current Render Settings → Deploy Hook URLs (https://api.render.com/deploy/srv-…?key=…). Live origin health is not a substitute.`
    );
  }
  return true;
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
  } else {
    const triggered = (await triggerHook()) || (await triggerRenderApi());
    const waited = await waitForGithubRenderDeploy(sha);
    if (!triggered && !waited) {
      throw new Error(
        "No valid deploy hook, Render API key, or GitHub Render deployment of the certified SHA was observed. Set PRODUCTION_DEPLOY_HOOK/OPS_DEPLOY_HOOK or RENDER_API_KEY plus service IDs."
      );
    }
  }

  if (!appUrl) {
    console.error("PRODUCTION_APP_URL is required so the workflow can prove the live SHA");
    process.exit(1);
  }

  for (let i = 0; i < 18; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const verify = spawnSync(process.execPath, [path.join(__dirname, "post-deploy-verify.js")], {
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
