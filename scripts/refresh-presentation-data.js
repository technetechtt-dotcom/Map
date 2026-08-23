/**
 * Non-destructive refresh for already-seeded databases.
 * Sets desktop verification dates on curated NC towns and aligns publicTitle.
 * Does not wipe data. Safe to re-run.
 */
const { PrismaClient } = require("@prisma/client");
const { locations } = require("../data/seed/nc-locations");
const {
  publicTitle,
  dataSource,
  ncReviewedAt,
  ncExpiresAt,
  ncVerificationNotes,
} = require("../data/seed/presentation");

const prisma = new PrismaClient();

async function upsertSetting(key, value) {
  const encoded = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: encoded },
    update: { value: encoded },
  });
}

async function main() {
  const reviewedAt = new Date(ncReviewedAt);
  const expiresAt = new Date(ncExpiresAt);

  const slugs = locations.filter((row) => row[11]).map((row) => row[0]);
  const updated = await prisma.location.updateMany({
    where: { slug: { in: slugs } },
    data: {
      lastVerifiedAt: reviewedAt,
      verificationExpiresAt: expiresAt,
      verificationNotes: ncVerificationNotes,
    },
  });

  await upsertSetting("publicTitle", publicTitle);
  await upsertSetting("dataSource", dataSource);

  console.log(
    `Updated ${updated.count} curated NC towns: lastVerifiedAt=${ncReviewedAt}, expires=${ncExpiresAt}.`
  );
  console.log(`Set publicTitle to "${publicTitle}".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
