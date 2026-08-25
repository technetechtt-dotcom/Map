/** Copy StoredObject binaries to the independent backup provider and verify SHA-256. */
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  copyStoredObjectsToBackup,
  objectStorageManifestPayload,
  verifyObjectChecksums,
} from "../src/lib/object-backup";

async function main() {
  const result = await copyStoredObjectsToBackup();
  const verified = await verifyObjectChecksums(result.manifest);
  const payload = {
    ok: verified.ok && result.failed?.length === 0,
    copied: result.copied,
    verified: result.verified,
    skipped: result.skipped,
    copiedBytes: result.copiedBytes,
    checksumSha256: result.checksumSha256,
    missing: verified.missing,
    mismatched: verified.mismatched,
    failed: result.failed,
    cursor: result.cursor || null,
  };
  const dataDir = path.join(process.cwd(), "data");
  await mkdir(dataDir, { recursive: true });
  const manifest = objectStorageManifestPayload(result.manifest, result.checksumSha256);
  await writeFile(path.join(dataDir, "object-storage-manifest.json"), JSON.stringify(manifest), "utf8");
  await writeFile(path.join(dataDir, "object-backup-result.json"), JSON.stringify(payload), "utf8");
  console.log(JSON.stringify(payload));
  if (!payload.ok && process.env.S3_BACKUP_BUCKET && process.env.S3_BUCKET) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
