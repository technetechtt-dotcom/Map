import { PrismaClient } from "@prisma/client";
import { loadNationalCatalog } from "../src/lib/ingestion/connectors";
import { applyImportBatch } from "../src/lib/import-apply";

const prisma = new PrismaClient();

async function main() {
  const batches = await loadNationalCatalog();
  for (const batch of batches) {
    const created = await prisma.importBatch.create({
      data: {
        source: batch.connector,
        sourceVersion: batch.sourceVersion,
        sourceUrl: batch.sourceUrl,
        checksumSha256: batch.contentHash || null,
        etag: batch.etag,
        contentHash: batch.contentHash || null,
        retrievedAt: batch.retrievedAt ? new Date(batch.retrievedAt) : new Date(),
        schemaDrift: batch.schemaDrift,
        licence: batch.licence,
        status: batch.schemaDrift ? "REJECTED" : "STAGED",
        rowCount: batch.rows.length,
        payloadJson: batch.rows,
        reportJson: batch.schemaDrift ? { schemaDrift: true, reason: batch.driftReason } : undefined,
      },
    });
    await prisma.ingestionConnectorRun.create({
      data: {
        connector: batch.connector,
        status: batch.schemaDrift ? "schema-drift" : "fetched",
        startedAt: new Date(batch.retrievedAt),
        finishedAt: new Date(),
        rowCount: batch.rows.length,
        sourceVersion: batch.sourceVersion,
        contentHash: batch.contentHash,
        etag: batch.etag,
        sourceUrl: batch.sourceUrl,
        retrievedAt: new Date(batch.retrievedAt),
        schemaDrift: batch.schemaDrift,
        error: batch.driftReason,
      },
    });
    console.log(JSON.stringify({
      staged: created.id,
      source: batch.connector,
      rows: batch.rows.length,
      sourceVersion: batch.sourceVersion,
      schemaDrift: batch.schemaDrift,
    }));
    if (process.env.APPLY_INGEST === "1" && !batch.schemaDrift) {
      const report = await applyImportBatch(created.id);
      console.log(JSON.stringify({ applied: created.id, report }));
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
