/** Verify an off-site object-storage manifest. Path is process.argv[2]. */
import { readFileSync } from "fs";
import { parseObjectManifest, verifyObjectChecksums } from "../src/lib/object-backup";

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("usage: npx tsx scripts/verify-object-manifest.ts <object-storage-manifest.json>");
    process.exit(1);
  }
  const rows = parseObjectManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const result = await verifyObjectChecksums(rows);
  if (!result.ok) {
    console.error(result);
    process.exit(1);
  }
  console.log("s3 objects verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
