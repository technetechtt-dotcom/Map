#!/usr/bin/env node
/**
 * Fail closed with named missing secrets. Used by backup and production-deploy workflows.
 * Does not print secret values.
 */
const mode = process.argv[2] || "backup";

const BACKUP_REQUIRED = [
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
  "NOTIFY_WEBHOOK_URL",
];

const DEPLOY_REQUIRED = ["PRODUCTION_APP_URL", "OPS_APP_URL"];
const DEPLOY_ONE_OF = [
  ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
  ["PRODUCTION_DEPLOY_HOOK"],
  ["RENDER_AUTO_DEPLOY"],
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
    if (present("NOTIFY_WEBHOOK_URL")) {
      try {
        const webhook = new URL(process.env.NOTIFY_WEBHOOK_URL);
        if (webhook.protocol !== "https:" || webhook.hostname === "example.invalid") {
          missing.push("NOTIFY_WEBHOOK_URL (real HTTPS operator endpoint)");
        }
      } catch {
        missing.push("NOTIFY_WEBHOOK_URL (valid HTTPS URL)");
      }
    }
    if (present("S3_BUCKET") && process.env.S3_BUCKET === process.env.S3_BACKUP_BUCKET) {
      missing.push("S3_BACKUP_BUCKET (must differ from S3_BUCKET)");
    }
    if (
      present("S3_ACCESS_KEY_ID") &&
      present("S3_BACKUP_ACCESS_KEY_ID") &&
      process.env.S3_ACCESS_KEY_ID === process.env.S3_BACKUP_ACCESS_KEY_ID
    ) {
      missing.push("S3_BACKUP_ACCESS_KEY_ID (must use independent credentials)");
    }
    if (
      present("S3_SECRET_ACCESS_KEY") &&
      present("S3_BACKUP_SECRET_ACCESS_KEY") &&
      process.env.S3_SECRET_ACCESS_KEY === process.env.S3_BACKUP_SECRET_ACCESS_KEY
    ) {
      missing.push("S3_BACKUP_SECRET_ACCESS_KEY (must use independent credentials)");
    }
  } else if (mode === "deploy") {
    for (const name of DEPLOY_REQUIRED) {
      if (!present(name)) missing.push(name);
    }
    const hasVercel = DEPLOY_ONE_OF[0].every(present);
    const hasHook = present("PRODUCTION_DEPLOY_HOOK");
    const hasRenderAutoDeploy = process.env.RENDER_AUTO_DEPLOY === "1";
    if (!hasVercel && !hasHook && !hasRenderAutoDeploy) {
      missing.push(
        "VERCEL_TOKEN+VERCEL_ORG_ID+VERCEL_PROJECT_ID, PRODUCTION_DEPLOY_HOOK, or RENDER_AUTO_DEPLOY=1"
      );
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
