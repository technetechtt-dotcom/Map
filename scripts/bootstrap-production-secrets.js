#!/usr/bin/env node
/**
 * Build a production secrets file from local .env plus generated values.
 * Usage: node scripts/bootstrap-production-secrets.js [output-file]
 * Then: npm run ops:sync-secrets .env.production.secrets
 *
 * Requires in .env or environment:
 * - DATABASE_URL, DIRECT_URL (Neon)
 * Optional overrides: PRODUCTION_APP_URL, OPS_APP_URL, PRODUCTION_DEPLOY_HOOK, VERCEL_*
 */
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { randomBytes } = require("crypto");
const { join } = require("path");

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function gen(n = 32) {
  return randomBytes(n).toString("base64url");
}

const local = { ...parseEnvFile(join(__dirname, "..", ".env")), ...process.env };
const outFile = process.argv[2] || join(__dirname, "..", ".env.production.secrets");

const cron = local.CRON_SECRET || local.METRICS_TOKEN || gen(32);
const lines = [];

function set(key, value) {
  if (value) lines.push(`${key}=${value}`);
}

set("PRODUCTION_DATABASE_URL", local.PRODUCTION_DATABASE_URL || local.DATABASE_URL);
set("PRODUCTION_DIRECT_URL", local.PRODUCTION_DIRECT_URL || local.DIRECT_URL);
set("PRODUCTION_APP_URL", local.PRODUCTION_APP_URL || "");
set("OPS_APP_URL", local.OPS_APP_URL || "");
set("CRON_SECRET", cron);
set("METRICS_TOKEN", local.METRICS_TOKEN || cron);
set("BACKUP_ENCRYPTION_KEY", local.BACKUP_ENCRYPTION_KEY || gen(24));
set("BACKUP_DESTINATION", local.BACKUP_DESTINATION || "");
set("RCLONE_CONFIG", local.RCLONE_CONFIG || "");
set("S3_BUCKET", local.S3_BUCKET || "");
set("S3_BACKUP_BUCKET", local.S3_BACKUP_BUCKET || local.S3_BUCKET || "");
set("S3_ACCESS_KEY_ID", local.S3_ACCESS_KEY_ID || "");
set("S3_SECRET_ACCESS_KEY", local.S3_SECRET_ACCESS_KEY || "");
set("S3_BACKUP_ACCESS_KEY_ID", local.S3_BACKUP_ACCESS_KEY_ID || local.S3_ACCESS_KEY_ID || "");
set("S3_BACKUP_SECRET_ACCESS_KEY", local.S3_BACKUP_SECRET_ACCESS_KEY || local.S3_SECRET_ACCESS_KEY || "");
set("PRODUCTION_DEPLOY_HOOK", local.PRODUCTION_DEPLOY_HOOK || "");
set("OPS_DEPLOY_HOOK", local.OPS_DEPLOY_HOOK || "");
set("VERCEL_TOKEN", local.VERCEL_TOKEN || "");
set("VERCEL_ORG_ID", local.VERCEL_ORG_ID || "");
set("VERCEL_PROJECT_ID", local.VERCEL_PROJECT_ID || "");
set("VERCEL_OPS_PROJECT_ID", local.VERCEL_OPS_PROJECT_ID || "");
set("NEON_API_KEY", local.NEON_API_KEY || "");
set("NEON_PROJECT_ID", local.NEON_PROJECT_ID || "old-night-27455221");

writeFileSync(outFile, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

const required = [
  "PRODUCTION_APP_URL",
  "PRODUCTION_DEPLOY_HOOK or VERCEL_*",
  "BACKUP_DESTINATION",
  "RCLONE_CONFIG",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];
const missing = [];
if (!local.PRODUCTION_APP_URL && !process.env.PRODUCTION_APP_URL) missing.push("PRODUCTION_APP_URL");
if (!local.PRODUCTION_DEPLOY_HOOK && !local.VERCEL_TOKEN) missing.push("PRODUCTION_DEPLOY_HOOK or VERCEL_*");
if (!local.BACKUP_DESTINATION) missing.push("BACKUP_DESTINATION");
if (!local.RCLONE_CONFIG) missing.push("RCLONE_CONFIG");
if (!local.S3_BUCKET) missing.push("S3_BUCKET");
if (!local.S3_ACCESS_KEY_ID) missing.push("S3_ACCESS_KEY_ID");

console.log(
  JSON.stringify(
    {
      ok: missing.length === 0,
      wrote: outFile,
      generated: ["CRON_SECRET/METRICS_TOKEN", "BACKUP_ENCRYPTION_KEY"],
      mappedFromEnv: ["PRODUCTION_DATABASE_URL", "PRODUCTION_DIRECT_URL"],
      stillRequired: missing,
      next: missing.length
        ? ["Add missing values to .env.production.secrets", "npm run ops:sync-secrets .env.production.secrets"]
        : ["npm run ops:sync-secrets .env.production.secrets", "npm run ops:audit-env"],
    },
    null,
    2
  )
);

process.exit(missing.length ? 1 : 0);
