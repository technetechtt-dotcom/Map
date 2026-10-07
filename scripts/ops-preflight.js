#!/usr/bin/env node
/**
 * Fail closed with named missing secrets. Used by backup and production-deploy workflows.
 * Does not print secret values.
 *
 * Supported modes:
 * - "config" / "ci": Validates deployment blueprints (render.yaml, build commands, gates)
 * - "deploy": Validates production deploy secrets
 * - "backup": Validates production backup secrets
 */
const { readFileSync, existsSync } = require("fs");
const { join } = require("path");

// In CI, default to "config" preflight unless an explicit mode argument is passed
const mode = process.argv[2] || (process.env.CI ? "config" : "backup");

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
  ["PRODUCTION_DEPLOY_HOOK", "OPS_DEPLOY_HOOK"],
  ["RENDER_API_KEY", "RENDER_PRODUCTION_SERVICE_ID", "RENDER_OPS_SERVICE_ID"],
  ["RENDER_PRODUCTION_SERVICE_ID", "RENDER_OPS_SERVICE_ID"],
];
const DEPLOY_AUTH = ["METRICS_TOKEN", "CRON_SECRET"];

function present(name) {
  return Boolean((process.env[name] || "").trim());
}

function validateRenderBlueprint() {
  const blueprintPath = join(__dirname, "..", "render.yaml");
  if (!existsSync(blueprintPath)) {
    return ["render.yaml file does not exist"];
  }

  const issues = [];
  try {
    let doc = null;
    const raw = readFileSync(blueprintPath, "utf8");
    try {
      const yaml = require("js-yaml");
      doc = yaml.load(raw);
    } catch {
      // Fallback: simple text parsing if js-yaml is unavailable in stripped environments
      if (!raw.includes("name: sa-ict-map-public") || !raw.includes("name: sa-ict-map-ops")) {
        issues.push("render.yaml missing mandatory service declarations");
      }
      if (/autoDeploy:\s*true/i.test(raw)) {
        issues.push("render.yaml services must have autoDeploy: false");
      }
      if (/buildCommand:.*prisma\s+migrate\s+deploy/i.test(raw)) {
        issues.push("render.yaml must not include prisma migrate deploy in buildCommand");
      }
      return issues;
    }
    if (!doc || typeof doc !== "object") {
      return ["render.yaml is not valid YAML"];
    }

    const services = Array.isArray(doc.services) ? doc.services : [];
    const publicSvc = services.find((s) => s.name === "sa-ict-map-public");
    const opsSvc = services.find((s) => s.name === "sa-ict-map-ops");

    if (!publicSvc) issues.push("render.yaml missing service 'sa-ict-map-public'");
    if (!opsSvc) issues.push("render.yaml missing service 'sa-ict-map-ops'");

    for (const svc of [publicSvc, opsSvc].filter(Boolean)) {
      // Direct pushes to main must not trigger unverified production auto-deploys
      if (svc.autoDeploy !== false && svc.autoDeployTrigger !== "off") {
        issues.push(`render.yaml service '${svc.name}' must have autoDeploy: false or autoDeployTrigger: off`);
      }

      // Migrations must run strictly in the dedicated production gate, never in buildCommand
      if (svc.buildCommand && /prisma\s+migrate\s+deploy/i.test(svc.buildCommand)) {
        issues.push(`render.yaml service '${svc.name}' must not include 'prisma migrate deploy' in buildCommand`);
      }
    }
  } catch (err) {
    issues.push(`Failed to parse render.yaml: ${err.message}`);
  }

  return issues;
}

function main() {
  const missing = [];

  if (mode === "config" || mode === "ci") {
    const blueprintIssues = validateRenderBlueprint();
    missing.push(...blueprintIssues);

    // Verify secret lists definition
    if (!BACKUP_REQUIRED.length || !DEPLOY_REQUIRED.length) {
      missing.push("Required secret definition sets are empty");
    }
  } else if (mode === "backup") {
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
    const hasTarget = DEPLOY_ONE_OF.some((group) => group.every(present));
    if (!hasTarget) {
      missing.push(
        "Deployment target: VERCEL_TOKEN+VERCEL_ORG_ID+VERCEL_PROJECT_ID, PRODUCTION_DEPLOY_HOOK+OPS_DEPLOY_HOOK, RENDER_API_KEY+service IDs, or RENDER_PRODUCTION_SERVICE_ID+RENDER_OPS_SERVICE_ID"
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
        hint: mode === "config" || mode === "ci"
          ? "Fix deployment blueprint configuration in render.yaml or repository structure."
          : "Set these on the GitHub Environment named production. See docs/ops-secrets.md.",
      }, null, 2)
    );
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, mode }));
}

main();
