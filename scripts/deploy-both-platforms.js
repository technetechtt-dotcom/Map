#!/usr/bin/env node
/** Deploy and exact-SHA verify the mandatory public map and ops console. */
const { spawnSync } = require("child_process");
const { join } = require("path");

function deploymentEnv(platform, source = process.env) {
  const ops = platform === "ops";
  if (!ops && platform !== "public") throw new Error(`Unknown platform: ${platform}`);
  const urlKey = ops ? "OPS_APP_URL" : "PRODUCTION_APP_URL";
  const hookKey = ops ? "OPS_DEPLOY_HOOK" : "PRODUCTION_DEPLOY_HOOK";
  const vercelKey = ops ? "VERCEL_OPS_PROJECT_ID" : "VERCEL_PROJECT_ID";
  const renderKey = ops ? "RENDER_OPS_SERVICE_ID" : "RENDER_PRODUCTION_SERVICE_ID";
  const url = (source[urlKey] || "").trim();
  if (!url) throw new Error(`Missing ${urlKey}; refusing to skip mandatory ${platform} deployment`);

  const env = {
    ...source,
    APP_PLATFORM: platform,
    PRODUCTION_APP_URL: url,
    PRODUCTION_DEPLOY_HOOK: source[hookKey] || "",
    VERCEL_PROJECT_ID: source[vercelKey] || "",
    RENDER_SERVICE_ID: source[renderKey] || "",
  };
  // Never permit a valid public project/service to silently stand in for ops.
  if (source.VERCEL_TOKEN && source.VERCEL_ORG_ID && !env.VERCEL_PROJECT_ID &&
      !env.PRODUCTION_DEPLOY_HOOK && !(source.RENDER_API_KEY && env.RENDER_SERVICE_ID)) {
    throw new Error(`Missing ${vercelKey}; refusing to deploy ${platform} to the wrong Vercel project`);
  }
  if (!env.PRODUCTION_DEPLOY_HOOK && !(source.RENDER_API_KEY && env.RENDER_SERVICE_ID) &&
      !(source.VERCEL_TOKEN && source.VERCEL_ORG_ID && env.VERCEL_PROJECT_ID) &&
      !env.RENDER_SERVICE_ID) {
    throw new Error(`No deployment target configured for ${platform}`);
  }
  return env;
}

function main() {
  // Validate both targets before triggering either production deployment.
  const targets = ["public", "ops"].map((platform) => ({
    platform,
    env: deploymentEnv(platform),
  }));
  for (const target of targets) {
    const r = spawnSync(process.execPath, [join(__dirname, "deploy-production.js")], {
      stdio: "inherit",
      env: target.env,
    });
    if (r.error) throw r.error;
    if (r.status !== 0) process.exit(r.status || 1);
  }
}

module.exports = { deploymentEnv, main };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
