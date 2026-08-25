#!/usr/bin/env node
/**
 * Vercel "Ignored Build Step":
 * exit 0 = skip this deployment
 * exit 1 = continue building
 *
 * Direct pushes to main are allowed, but a red CI/Security SHA must not ship.
 * Missing GitHub token cannot certify the SHA — fail closed and skip the build.
 */
const { spawnSync } = require("child_process");

function ignoredBuildDecision(env = process.env) {
  const branch = env.VERCEL_GIT_COMMIT_REF || env.GITHUB_REF_NAME || "";
  if (branch && branch !== "main" && branch !== "master") {
    return { action: "skip", reason: "non-production branch" };
  }
  if (!env.GITHUB_TOKEN && !env.GH_TOKEN) {
    return { action: "skip", reason: "missing GitHub token — fail closed" };
  }
  return { action: "certify", reason: "production branch with GitHub token" };
}

function main(env = process.env) {
  const decision = ignoredBuildDecision(env);
  if (decision.action === "skip") {
    console.error(decision.reason);
    return 0;
  }
  const result = spawnSync(process.execPath, [require("path").join(__dirname, "assert-main-green.js")], {
    stdio: "inherit",
    env,
  });
  return result.status === 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { ignoredBuildDecision, main };
