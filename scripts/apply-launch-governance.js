#!/usr/bin/env node
/**
 * Apply launch branch protection (PR + signed commits + CODEOWNERS).
 * Usage: node scripts/apply-launch-governance.js [--dry-run]
 */
const { readFileSync } = require("fs");
const { execSync } = require("child_process");
const { join } = require("path");

const dryRun = process.argv.includes("--dry-run");
const configPath = join(__dirname, "..", "docs", "branch-protection-launch.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

function gh(args) {
  const cmd = `gh api repos/{owner}/{repo}/branches/main/protection --method PUT --input -`;
  if (dryRun) {
    console.log("[dry-run]", cmd);
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  execSync(cmd, { input: JSON.stringify(config), stdio: ["pipe", "inherit", "inherit"] });
}

try {
  gh();
  console.log(JSON.stringify({ ok: true, applied: "branch-protection-launch.json", branch: "main" }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
