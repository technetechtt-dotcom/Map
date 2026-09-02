#!/usr/bin/env node
/** Deploy public map then ops console when OPS_APP_URL is configured. */
const { spawnSync } = require("child_process");
const { join } = require("path");

function deploy(platform, urlKey, hookKey, projectKey) {
  const url = process.env[urlKey];
  if (!url) {
    console.log(JSON.stringify({ skipped: platform, reason: `${urlKey} not set` }));
    return 0;
  }
  const env = {
    ...process.env,
    APP_PLATFORM: platform,
    PRODUCTION_APP_URL: url,
    PRODUCTION_DEPLOY_HOOK: process.env[hookKey] || process.env.PRODUCTION_DEPLOY_HOOK || "",
    VERCEL_PROJECT_ID: process.env[projectKey] || process.env.VERCEL_PROJECT_ID || "",
  };
  const r = spawnSync(process.execPath, [join(__dirname, "deploy-production.js")], { stdio: "inherit", env });
  return r.status || 0;
}

const publicCode = deploy("public", "PRODUCTION_APP_URL", "PRODUCTION_DEPLOY_HOOK", "VERCEL_PROJECT_ID");
if (publicCode !== 0) process.exit(publicCode);
const opsCode = deploy("ops", "OPS_APP_URL", "OPS_DEPLOY_HOOK", "VERCEL_OPS_PROJECT_ID");
process.exit(opsCode);
