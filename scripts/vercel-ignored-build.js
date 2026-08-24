#!/usr/bin/env node
/**
 * Vercel "Ignored Build Step":
 * exit 0 = skip this deployment
 * exit 1 = continue building
 *
 * Direct pushes to main are allowed, but a red CI/Security SHA must not ship.
 */
const { spawnSync } = require("child_process");

const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || "";
if (branch && branch !== "main" && branch !== "master") {
  process.exit(0);
}

if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
  console.warn("No GitHub token on Vercel — cannot certify SHA; continuing the production build");
  process.exit(1);
}

const result = spawnSync(process.execPath, [require("path").join(__dirname, "assert-main-green.js")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status === 0 ? 1 : 0);
