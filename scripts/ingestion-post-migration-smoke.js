#!/usr/bin/env node
/**
 * Verify ExternalIdentity-only matching after migration.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const [locations, orgs, identities, dupes] = await Promise.all([
    prisma.location.count(),
    prisma.organisation.count({ where: { mergedIntoId: null } }),
    prisma.externalIdentity.groupBy({ by: ["entityType"], _count: true }),
    prisma.$queryRaw`
      SELECT connector, "externalId", "entityType", COUNT(*)::int AS c
      FROM "ExternalIdentity"
      GROUP BY connector, "externalId", "entityType"
      HAVING COUNT(*) > 1
      LIMIT 5
    `,
  ]);

  const columns = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name IN ('Location','Organisation') AND column_name = 'externalId'
  `;
  if (Array.isArray(columns) && columns.length > 0) {
    throw new Error("Location.externalId or Organisation.externalId still present — migration incomplete");
  }
  if (Array.isArray(dupes) && dupes.length > 0) {
    throw new Error(`Duplicate ExternalIdentity rows: ${JSON.stringify(dupes)}`);
  }

  const sample = await prisma.externalIdentity.findFirst({ orderBy: { createdAt: "desc" } });
  if (sample) {
    if (sample.entityType === "location") {
      const loc = await prisma.location.findUnique({ where: { id: sample.entityId } });
      if (!loc) throw new Error("ExternalIdentity location pointer broken");
    }
    if (sample.entityType === "organisation") {
      const org = await prisma.organisation.findUnique({ where: { id: sample.entityId } });
      if (!org) throw new Error("ExternalIdentity organisation pointer broken");
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      locations,
      organisations: orgs,
      identitiesByType: identities,
      externalIdColumnsRemoved: true,
      duplicateIdentities: 0,
    })
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
