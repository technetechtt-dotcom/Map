#!/usr/bin/env node
/**
 * Audit GitHub Environment `production` secrets without printing values.
 * Usage: node scripts/audit-production-env.js
 */
const { execSync } = require("child_process");

const BACKUP = [
  "PRODUCTION_DIRECT_URL",
  "PRODUCTION_DATABASE_URL",
  "BACKUP_ENCRYPTION_KEY",
  "BACKUP_DESTINATION",
  "RCLONE_CONFIG",
  "S3_BUCKET",
  "S3_BACKUP_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BACKUP_ACCESS_KEY_ID",
  "S3_BACKUP_SECRET_ACCESS_KEY",
  "PRODUCTION_APP_URL",
  "CRON_SECRET",
];
const DEPLOY = [
  "PRODUCTION_APP_URL",
  "METRICS_TOKEN",
  "CRON_SECRET",
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "PRODUCTION_DEPLOY_HOOK",
];
const OPTIONAL = ["NEON_API_KEY", "NEON_PROJECT_ID", "NOTIFY_WEBHOOK_URL", "RESEND_API_KEY"];

function listSecrets() {
  try {
    const out = execSync("gh secret list --env production --json name", { encoding: "utf8" });
    return new Set(JSON.parse(out).map((r) => r.name));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: "gh secret list failed — sign in with gh auth login" }));
    process.exit(1);
  }
}

function audit(names, present) {
  return names.map((name) => ({ name, present: present.has(name) }));
}

function main() {
  const present = listSecrets();
  const backupAudit = audit(BACKUP, present);
  const deployAudit = audit(DEPLOY, present);
  const optionalAudit = audit(OPTIONAL, present);
  const backupMissing = backupAudit.filter((r) => !r.present).map((r) => r.name);
  const deployMissing = [];
  if (!present.has("PRODUCTION_APP_URL")) deployMissing.push("PRODUCTION_APP_URL");
  const hasVercel = ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"].every((n) => present.has(n));
  const hasHook = present.has("PRODUCTION_DEPLOY_HOOK");
  if (!hasVercel && !hasHook) deployMissing.push("VERCEL_TOKEN+VERCEL_ORG_ID+VERCEL_PROJECT_ID or PRODUCTION_DEPLOY_HOOK");
  if (!present.has("METRICS_TOKEN") && !present.has("CRON_SECRET")) deployMissing.push("METRICS_TOKEN or CRON_SECRET");
  const deployReady = deployMissing.length === 0;
  const backupReady = backupMissing.length === 0;

  const report = {
    ok: deployReady && backupReady,
    environment: "production",
    backupReady,
    deployReady,
    backupMissing,
    deployMissing,
    backup: backupAudit,
    deploy: deployAudit,
    optional: optionalAudit,
    nextSteps: [],
  };
  if (backupMissing.length) {
    report.nextSteps.push("Set missing backup secrets: gh secret set NAME --env production");
    report.nextSteps.push("See docs/ops-secrets.md");
  }
  if (!report.deployReady) {
    report.nextSteps.push("Configure VERCEL_* or PRODUCTION_DEPLOY_HOOK plus METRICS_TOKEN/CRON_SECRET");
    report.nextSteps.push("Dispatch Production deploy workflow after CI green on target SHA");
  }
  if (report.backupReady) {
    report.nextSteps.push("gh workflow run backup.yml --ref main");
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
