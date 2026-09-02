#!/usr/bin/env node
/**
 * Production Neon: deploy ExternalIdentity migration + post-migration smoke.
 * Requires PRODUCTION_DIRECT_URL or DATABASE_URL pointing at production (unpooled).
 */
const { execSync } = require("child_process");

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
