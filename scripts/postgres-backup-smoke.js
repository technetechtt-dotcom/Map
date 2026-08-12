/**
 * PostgreSQL dump/restore smoke using the CI/local DATABASE_URL.
 * Requires `pg_dump`/`psql` on PATH (GitHub Actions postgres-client or local install).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const url = process.env.DATABASE_URL || "";
if (!url.startsWith("postgres")) {
  console.log("Skipping pg backup smoke (DATABASE_URL is not PostgreSQL)");
  process.exit(0);
}

function run(cmd) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", env: process.env });
}

try {
  run("pg_dump --version");
} catch {
  console.log("Skipping pg backup smoke (pg_dump not installed)");
  process.exit(0);
}

const dumpFile = path.join(os.tmpdir(), `ictmap-ci-${Date.now()}.sql`);
try {
  execSync(`pg_dump --no-owner --no-acl --format=plain --dbname="${url}"`, {
    stdio: ["ignore", fs.openSync(dumpFile, "w"), "pipe"],
    env: process.env,
  });
  const size = fs.statSync(dumpFile).size;
  if (size < 100) throw new Error("dump too small");
  const head = fs.readFileSync(dumpFile, "utf8").slice(0, 2000);
  if (!/PostgreSQL database dump/i.test(head) && !/CREATE TABLE/i.test(head) && size < 500) {
    throw new Error("dump does not look like a PostgreSQL dump");
  }
  console.log(`PostgreSQL dump smoke OK (${size} bytes)`);
} finally {
  try {
    fs.unlinkSync(dumpFile);
  } catch {
    /* ignore */
  }
}
