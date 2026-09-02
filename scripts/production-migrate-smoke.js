#!/usr/bin/env node
/**
 * Production Neon: deploy ExternalIdentity migration + post-migration smoke.
 * Requires PRODUCTION_DIRECT_URL or DATABASE_URL pointing at production (unpooled).
 */
const { execSync } = require("child_process");
const { readFileSync, existsSync } = require("fs");
const { join } = require("path");

function loadDotEnv() {
  const file = join(__dirname, "..", ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

function run(cmd) {
  console.log(`\n==> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
}

const url = process.env.PRODUCTION_DIRECT_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set PRODUCTION_DIRECT_URL or DIRECT_URL");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/i.test(url) && process.env.ALLOW_LOCAL_PRODUCTION_MIGRATE !== "1") {
  console.error("Refusing migrate against localhost. Set ALLOW_LOCAL_PRODUCTION_MIGRATE=1 to override.");
  process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

run("npx prisma generate");
run("npx prisma migrate deploy");
run("node scripts/ingestion-post-migration-smoke.js");

console.log(JSON.stringify({ ok: true, migration: "deployed", smoke: "passed" }));
