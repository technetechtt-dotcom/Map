#!/usr/bin/env node
/**
 * Push secrets from a local env file into GitHub Environment `production`.
 * Usage: node scripts/sync-production-secrets.js .env.production.secrets
 * Never commit the secrets file.
 */
const { readFileSync, existsSync } = require("fs");
const { spawnSync } = require("child_process");

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: node scripts/sync-production-secrets.js <secrets-file>");
  process.exit(1);
}

const ALLOWED = new Set([
  "PRODUCTION_APP_URL",
  "OPS_APP_URL",
  "PRODUCTION_DEPLOY_HOOK",
  "OPS_DEPLOY_HOOK",
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "VERCEL_OPS_PROJECT_ID",
  "METRICS_TOKEN",
  "CRON_SECRET",
  "PRODUCTION_DATABASE_URL",
  "PRODUCTION_DIRECT_URL",
  "BACKUP_ENCRYPTION_KEY",
  "BACKUP_DESTINATION",
  "RCLONE_CONFIG",
  "S3_BUCKET",
  "S3_BACKUP_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BACKUP_ACCESS_KEY_ID",
  "S3_BACKUP_SECRET_ACCESS_KEY",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
  "NOTIFY_WEBHOOK_URL",
  "RESEND_API_KEY",
]);

const lines = readFileSync(file, "utf8").split(/\r?\n/);
const set = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!ALLOWED.has(key) || !value) continue;
  set.push(key);
  const result = spawnSync("gh", ["secret", "set", key, "--env", "production", "--body", value], {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(JSON.stringify({ ok: true, set, count: set.length }));
console.log("Run: node scripts/audit-production-env.js");
