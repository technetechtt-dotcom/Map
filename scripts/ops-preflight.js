#!/usr/bin/env node
/**
 * Fail closed with named missing secrets. Used by backup and production-deploy workflows.
 * Does not print secret values.
 */
const mode = process.argv[2] || "backup";

const BACKUP_REQUIRED = [
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
  "PRODUCTION_APP_URL",
  "CRON_SECRET",
];

const DEPLOY_REQUIRED = ["PRODUCTION_APP_URL"];
const DEPLOY_ONE_OF = [
  ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
  ["PRODUCTION_DEPLOY_HOOK"],
];
const DEPLOY_AUTH = ["METRICS_TOKEN", "CRON_SECRET"];

function present(name) {
  return Boolean((process.env[name] || "").trim());
}

function main() {
  const missing = [];
  if (mode === "backup") {
    for (const name of BACKUP_REQUIRED) {
      if (!present(name)) missing.push(name);
    }
  } else if (mode === "deploy") {
    for (const name of DEPLOY_REQUIRED) {
      if (!present(name)) missing.push(name);
    }
    const hasVercel = DEPLOY_ONE_OF[0].every(present);
    const hasHook = present("PRODUCTION_DEPLOY_HOOK");
    if (!hasVercel && !hasHook) {
      missing.push("VERCEL_TOKEN+VERCEL_ORG_ID+VERCEL_PROJECT_ID or PRODUCTION_DEPLOY_HOOK");
    }
    if (!DEPLOY_AUTH.some(present)) missing.push("METRICS_TOKEN or CRON_SECRET");
  } else {
    console.error(`Unknown preflight mode: ${mode}`);
    process.exit(2);
  }

  if (missing.length) {
    console.error(
      JSON.stringify({
        ok: false,
        mode,
        missing,
        hint: "Set these on the GitHub Environment named production. See docs/ops-secrets.md.",
      })
    );
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, mode }));
}

main();
