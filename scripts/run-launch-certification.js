#!/usr/bin/env node
/**
 * Operator orchestrator for launch gates — audits config, runs local checks, prints next workflow dispatches.
 */
const { execSync, spawnSync } = require("child_process");
const { join } = require("path");

const steps = [];

function run(name, cmd) {
  steps.push({ name, status: "running" });
  try {
    execSync(cmd, { stdio: "inherit", shell: true });
    steps[steps.length - 1].status = "pass";
  } catch {
    steps[steps.length - 1].status = "fail";
  }
}

run("unit-tests", "npm test");
run("typecheck", "npm run typecheck");
run("lint", "npm run lint");
run("adversarial-auth", "npm test -- tests/adversarial-auth.test.ts tests/ecosystem-bola.test.ts");
run("audit-production-env", "node scripts/audit-production-env.js");

const audit = steps.find((s) => s.name === "audit-production-env");
console.log(
  JSON.stringify(
    {
      ok: steps.every((s) => s.status === "pass" || s.name === "audit-production-env"),
      steps,
      operatorNext: [
        "node scripts/sync-production-secrets.js .env.production.secrets",
        "gh workflow run backup.yml --ref main",
        "gh workflow run offsite-dr.yml --ref main",
        "gh workflow run staging-exercise.yml --ref main",
        "gh workflow run production-gate.yml --ref main",
        "node scripts/production-migrate-smoke.js  # with PRODUCTION_DIRECT_URL",
        "node scripts/apply-launch-governance.js",
      ],
      note: audit?.status === "fail" ? "Production secrets incomplete — deploy/backup workflows will fail until configured." : "Secrets audit passed.",
    },
    null,
    2
  )
);

process.exit(steps.some((s) => s.status === "fail" && s.name !== "audit-production-env") ? 1 : 0);
