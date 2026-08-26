/**
 * Disaster-recovery smoke: dump, encrypt, restore into a clean PostgreSQL/PostGIS database, verify.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { libpqUrl } = require("./pg-url");

const url = libpqUrl(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
if (!/^postgres(ql)?:\/\//i.test(url)) {
  console.log("Skipping DR smoke (DATABASE_URL is not PostgreSQL)");
  process.exit(0);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", env: process.env, ...opts });
}

function toHttp(connectionUrl) {
  return connectionUrl.replace(/^postgres(ql)?:/i, "http:");
}

function fromHttp(httpUrl, original) {
  return httpUrl.replace(/^http:/i, original.startsWith("postgresql") ? "postgresql:" : original.match(/^postgres:/i) ? "postgres:" : "postgresql:");
}

function withDatabase(connectionUrl, dbName) {
  const parsed = new URL(toHttp(connectionUrl));
  parsed.pathname = `/${dbName}`;
  return libpqUrl(fromHttp(parsed.toString(), connectionUrl));
}

function databaseName(connectionUrl) {
  const parsed = new URL(toHttp(connectionUrl));
  return decodeURIComponent((parsed.pathname || "/").replace(/^\//, "").split("/")[0] || "postgres");
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error("unsafe database name");
  return `"${name}"`;
}

try {
  run("pg_dump --version");
  run("psql --version");
} catch {
  console.log("Skipping DR smoke (pg_dump/psql not installed)");
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ictmap-dr-"));
const dump = path.join(dir, "database.sql");
const restoredDump = path.join(dir, "restored.sql");
const started = Date.now();
const restoreDb = `ictmap_dr_${Date.now()}`;
const adminUrl = withDatabase(url, "postgres");
const restoreUrl = withDatabase(url, restoreDb);
let created = false;

try {
  execSync(`pg_dump --no-owner --no-acl --format=plain --dbname="${url}"`, {
    stdio: ["ignore", fs.openSync(dump, "w"), "pipe"],
    env: process.env,
  });
  const size = fs.statSync(dump).size;
  if (size < 100) throw new Error("dump too small");
  const dumpText = fs.readFileSync(dump, "utf8");
  if (!/CREATE EXTENSION.*postgis/i.test(dumpText) && !/spatial_ref_sys/i.test(dumpText) && !/Location/i.test(dumpText)) {
    throw new Error("dump missing expected PostGIS/application objects");
  }

  const key = process.env.BACKUP_ENCRYPTION_KEY || "ci-backup-encryption-key-min-16";
  const { gpgWithPassphrase } = require("./gpg-passphrase");
  gpgWithPassphrase(["--symmetric", "--cipher-algo", "AES256", "--output", `${dump}.gpg`, dump], key);
  try {
    gpgWithPassphrase(["--decrypt", `${dump}.gpg`], "wrong-key-should-fail");
    throw new Error("wrong encryption key unexpectedly succeeded");
  } catch (error) {
    if (String(error.message || error).includes("unexpectedly succeeded")) throw error;
  }
  gpgWithPassphrase(["--decrypt", "--output", restoredDump, `${dump}.gpg`], key);

  try {
    run(`psql --dbname="${adminUrl}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${quoteIdent(restoreDb)}"`);
    created = true;
  } catch (error) {
    const detail = error.message || String(error);
    if (process.env.CI || process.env.POSTGRES_INTEGRATION === "1") {
      throw new Error(`Could not create clean restore database ${restoreDb}: ${detail}`);
    }
    console.log(JSON.stringify({ ok: true, restoreSkipped: true, reason: "host cannot CREATE DATABASE", size, postgisPresent: /postgis|spatial_ref_sys/i.test(dumpText) }));
    return;
  }

  run(`psql --dbname="${restoreUrl}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis"`);
  run(`psql --dbname="${restoreUrl}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"`);
  execSync(`psql --dbname="${restoreUrl}" -v ON_ERROR_STOP=1 -f "${restoredDump}"`, {
    stdio: "pipe",
    env: process.env,
  });

  const postgis = run(`psql --dbname="${restoreUrl}" -At -c "SELECT PostGIS_Version();"`).trim();
  if (!postgis) throw new Error("restored database missing PostGIS");
  const locationCount = Number(run(`psql --dbname="${restoreUrl}" -At -c "SELECT COUNT(*) FROM \\"Location\\";"`).trim());
  const organisationCount = Number(run(`psql --dbname="${restoreUrl}" -At -c "SELECT COUNT(*) FROM \\"Organisation\\";"`).trim());
  if (!Number.isFinite(locationCount) || !Number.isFinite(organisationCount)) {
    throw new Error("restored database missing application tables");
  }

  const checksum = crypto.createHash("sha256").update(fs.readFileSync(dump)).digest("hex");
  const restoredChecksum = crypto.createHash("sha256").update(fs.readFileSync(restoredDump)).digest("hex");
  if (checksum !== restoredChecksum) throw new Error("decrypted dump does not match source dump");
  const rtoMinutes = Math.max(1, Math.round((Date.now() - started) / 60000) || 1);
  const report = {
    ok: true,
    size,
    checksum,
    sourceDatabase: databaseName(url),
    restoreDatabase: restoreDb,
    restoreUrl,
    postgisVersion: postgis,
    locationCount,
    organisationCount,
    rpoMinutes: 1440,
    rtoObservedMinutes: rtoMinutes,
  };
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "data", "dr-restore.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (process.env.KEEP_RESTORE_DB === "1") {
    created = false;
  }
} finally {
  if (created) {
    try {
      run(
        `psql --dbname="${adminUrl}" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${restoreDb}' AND pid <> pg_backend_pid();"`
      );
      run(`psql --dbname="${adminUrl}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${quoteIdent(restoreDb)}"`);
    } catch {
      // Best-effort cleanup so CI images do not leak restore databases.
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
