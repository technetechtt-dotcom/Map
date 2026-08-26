#!/usr/bin/env node
/**
 * Download the latest off-site encrypted database dump, hash the ciphertext,
 * decrypt, restore into disposable PostGIS, and write data/dr-restore.json.
 * Never targets production Neon.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { libpqUrl } = require("./pg-url");
const { gpgWithPassphrase } = require("./gpg-passphrase");

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", env: process.env, ...opts });
}

function isNeon(url) {
  return /neon\.tech|neon\.build/i.test(url || "");
}

function toHttp(connectionUrl) {
  return connectionUrl.replace(/^postgres(ql)?:/i, "http:");
}

function fromHttp(httpUrl, original) {
  return httpUrl.replace(/^http:/i, original.startsWith("postgresql") ? "postgresql:" : "postgresql:");
}

function withDatabase(connectionUrl, dbName) {
  const parsed = new URL(toHttp(connectionUrl));
  parsed.pathname = `/${dbName}`;
  return libpqUrl(fromHttp(parsed.toString(), connectionUrl));
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error("unsafe database name");
  return `"${name}"`;
}

const restoreTarget = libpqUrl(process.env.STAGING_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL || "");
if (!restoreTarget) {
  console.error("Set DATABASE_URL for the disposable restore target");
  process.exit(1);
}
if (isNeon(restoreTarget) && process.env.ALLOW_DESTRUCTIVE_STAGING !== "1") {
  console.error("Refusing off-site restore into Neon");
  process.exit(1);
}

const dest = (process.env.BACKUP_DESTINATION || "").replace(/\/$/, "");
const key = process.env.BACKUP_ENCRYPTION_KEY;
if (!dest || !key) {
  console.error("BACKUP_DESTINATION and BACKUP_ENCRYPTION_KEY are required");
  process.exit(1);
}

const listing = run(`rclone lsf "${dest}/database/" --dirs-only`).trim().split(/\r?\n/).filter(Boolean).sort();
const latest = (listing[listing.length - 1] || "").replace(/\/$/, "");
if (!latest) {
  console.error("No off-site database folders found");
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ictmap-offsite-"));
const gpgPath = path.join(dir, "database.dump.gpg");
const dumpPath = path.join(dir, "database.dump");
const remotePrefix = `${dest}/database/${latest}`;
run(`rclone copyto "${remotePrefix}/database.dump.gpg" "${gpgPath}"`);
const remoteHash = crypto.createHash("sha256").update(fs.readFileSync(gpgPath)).digest("hex");
const sidecarPath = path.join(dir, "database.dump.gpg.sha256");
try {
  run(`rclone copyto "${remotePrefix}/database.dump.gpg.sha256" "${sidecarPath}"`);
} catch {
  console.error("Checksum sidecar database.dump.gpg.sha256 is required for off-site restore");
  process.exit(1);
}
if (!fs.existsSync(sidecarPath)) {
  console.error("Checksum sidecar was not downloaded");
  process.exit(1);
}
const sidecar = fs.readFileSync(sidecarPath, "utf8").trim().split(/\s+/)[0];
if (!sidecar) {
  console.error("Checksum sidecar is empty");
  process.exit(1);
}
if (sidecar !== remoteHash) {
  console.error("off-site ciphertext hash does not match sidecar");
  process.exit(1);
}
gpgWithPassphrase(["--decrypt", "--output", dumpPath, gpgPath], key);

const restoreDb = `ictmap_offsite_${Date.now()}`;
const adminUrl = withDatabase(restoreTarget, "postgres");
const restoreUrl = withDatabase(restoreTarget, restoreDb);
let created = false;
try {
  run(`psql --dbname="${adminUrl}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${quoteIdent(restoreDb)}"`);
  created = true;
  run(`psql --dbname="${restoreUrl}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis"`);
  run(`psql --dbname="${restoreUrl}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"`);
  try {
    execSync(`pg_restore --no-owner --no-acl --dbname="${restoreUrl}" "${dumpPath}"`, { stdio: "pipe", env: process.env });
  } catch {
    execSync(`psql --dbname="${restoreUrl}" -v ON_ERROR_STOP=1 -f "${dumpPath}"`, { stdio: "pipe", env: process.env });
  }

  const postgis = run(`psql --dbname="${restoreUrl}" -At -c "SELECT PostGIS_Version();"`).trim();
  const locationCount = Number(run(`psql --dbname="${restoreUrl}" -At -c "SELECT COUNT(*) FROM \\"Location\\";"`).trim());
  const organisationCount = Number(run(`psql --dbname="${restoreUrl}" -At -c "SELECT COUNT(*) FROM \\"Organisation\\";"`).trim());
  const report = {
    ok: true,
    latest,
    remoteHash,
    restoreDatabase: restoreDb,
    restoreUrl,
    postgisVersion: postgis,
    locationCount,
    organisationCount,
  };
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "data", "dr-restore.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, restoreUrl: "[redacted]" }));
  if (process.env.KEEP_RESTORE_DB === "1") created = false;
} finally {
  if (created) {
    try {
      run(`psql --dbname="${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${quoteIdent(restoreDb)}"`);
    } catch {
      // best-effort
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
