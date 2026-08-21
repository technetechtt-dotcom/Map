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
        sourceVersion: new Date().toISOString().slice(0, 10),
        licence: batch.licence,
        status: "STAGED",
        rowCount: batch.rows.length,
        payloadJson: batch.rows,
      },
    });
    console.log(JSON.stringify({ staged: created.id, source: batch.connector, rows: batch.rows.length }));
    if (process.env.APPLY_INGEST === "1") {
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
