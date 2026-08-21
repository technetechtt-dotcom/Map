/** Copy StoredObject binaries to the independent backup provider and verify SHA-256. */
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { copyStoredObjectsToBackup, verifyObjectChecksums } from "../src/lib/object-backup";

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
  };
  await mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await writeFile(path.join(process.cwd(), "data", "object-backup-result.json"), JSON.stringify(payload), "utf8");
  console.log(JSON.stringify(payload));
  if (!payload.ok && process.env.S3_BACKUP_BUCKET && process.env.S3_BUCKET) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
