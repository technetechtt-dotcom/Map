#!/usr/bin/env node
/**
 * Production-like staging exercise:
 * migrate → load → backup → destructive restore → load test → defensive security checks.
 *
 * Never targets production Neon. Destructive restore uses a disposable local/CI database.
 */
const { execSync, spawnSync } = require("child_process");
const path = require("path");

function run(cmd, opts = {}) {
  console.log(`\n==> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env, ...opts });
}

function isNeon(url) {
  return /neon\.tech|neon\.build/i.test(url || "");
}

async function loadTest(baseUrl) {
  const times = [];
  for (let i = 0; i < 25; i += 1) {
    const started = Date.now();
    const res = await fetch(`${baseUrl}/api/health/live`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`health live ${res.status}`);
    times.push(Date.now() - started);
  }
  times.sort((a, b) => a - b);
  return { samples: times.length, p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)] };
}

async function main() {
  const url = process.env.STAGING_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!url) {
    console.error("Set STAGING_DATABASE_URL or DATABASE_URL");
    process.exit(1);
  }
  if (isNeon(url) && process.env.ALLOW_DESTRUCTIVE_STAGING !== "1") {
    console.error("Refusing destructive restore against Neon. Use CI PostGIS or a disposable staging branch.");
    process.exit(1);
  }

  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = process.env.DIRECT_URL || url;
  process.env.GEOCODER_DISABLED = process.env.GEOCODER_DISABLED || "1";

  run("npx prisma generate");
  run("npx prisma migrate deploy");
  run("node prisma/seed.js");
  run("node scripts/restore-backup-smoke.js");
  run("node scripts/postgres-backup-smoke.js");
  run("node scripts/disaster-recovery-smoke.js");

  const baseUrl = process.env.STAGING_BASE_URL || "";
  let load = null;
  if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
    load = await loadTest(baseUrl.replace(/\/$/, ""));
    console.log("load_test", load);
  } else {
    console.log("load_test skipped (set STAGING_BASE_URL)");
  }

  const audit = spawnSync(process.execPath, [path.join(__dirname, "ci-audit.js")], { stdio: "inherit", env: process.env });
  if (audit.status !== 0) process.exit(audit.status || 1);

  console.log(JSON.stringify({
    ok: true,
    stages: ["migrate", "load-seed", "backup", "destructive-restore", load ? "load-test" : "load-test-skipped", "defensive-security-audit"],
    load,
    note: "Independent penetration testing is a scheduled third-party exercise; this run uses dependency audit and restore drills, not exploit payloads.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
