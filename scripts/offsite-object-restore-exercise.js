#!/usr/bin/env node
/**
 * Download the latest off-site object manifests and require checksum sidecars.
 * When independent object-backup credentials are present, also verify destination objects.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", env: process.env });
}

function requireSidecar(dir, filename) {
  const filePath = path.join(dir, filename);
  const sidecarPath = path.join(dir, `${filename}.sha256`);
  if (!fs.existsSync(filePath) || !fs.existsSync(sidecarPath)) {
    throw new Error(`Missing ${filename} or its checksum sidecar`);
  }
  const expected = fs.readFileSync(sidecarPath, "utf8").trim().split(/\s+/)[0];
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (expected !== actual) throw new Error(`${filename} checksum sidecar mismatch`);
}

const dest = (process.env.BACKUP_DESTINATION || "").replace(/\/$/, "");
if (!dest) {
  console.error("BACKUP_DESTINATION is required for object DR");
  process.exit(1);
}

const listing = run(`rclone lsf "${dest}/objects/" --dirs-only`).trim().split(/\r?\n/).filter(Boolean).sort();
const latest = (listing[listing.length - 1] || "").replace(/\/$/, "");
if (!latest) {
  console.error("No off-site object folders found");
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ictmap-objects-"));
try {
  run(`rclone copy "${dest}/objects/${latest}/" "${dir}"`);
  requireSidecar(dir, "object-backup-result.json");
  requireSidecar(dir, "object-storage-manifest.json");
  const result = JSON.parse(fs.readFileSync(path.join(dir, "object-backup-result.json"), "utf8"));
  if (result.ok !== true) throw new Error("recorded object backup was not ok");
  const report = { ok: true, latest, copied: result.copied, checksumSha256: result.checksumSha256 };
  if (process.env.S3_BACKUP_BUCKET && process.env.S3_BACKUP_ACCESS_KEY_ID) {
    execSync("npx tsx -e \"import { verifyObjectChecksums } from './src/lib/object-backup'; const manifest=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); const rows=Array.isArray(manifest)?manifest:(manifest.objects||[]); verifyObjectChecksums(rows).then(r=>{ if(!r.ok) { console.error(r); process.exit(1);} console.log('s3 objects verified'); })\"", {
      stdio: "inherit",
      env: process.env,
    });
  }
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "data", "dr-objects.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
