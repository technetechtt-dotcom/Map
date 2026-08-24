#!/usr/bin/env node
/**
 * Load a generated scale catalog into disposable PostGIS.
 * Refuses Neon. Does not replace curated NC towns.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function isNeon(url) {
  return /neon\.tech|neon\.build/i.test(url || "");
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (isNeon(url) && process.env.ALLOW_DESTRUCTIVE_STAGING !== "1") {
    console.error("Refusing to seed scale data into Neon");
    process.exit(1);
  }
  const file = path.join(process.cwd(), "data", "performance", "generated-locations.json");
  if (!fs.existsSync(file)) {
    console.error("Run npm run load:scale-generate first");
    process.exit(1);
  }
  const dataset = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  const [provinces, categories] = await Promise.all([
    prisma.province.findMany(),
    prisma.category.findMany(),
  ]);
  const provinceBySlug = Object.fromEntries(provinces.map((row) => [row.slug, row]));
  const categoryBySlug = Object.fromEntries(categories.map((row) => [row.slug, row]));
  const fallbackCategory = categories[0];
  let created = 0;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk).filter((row) => provinceBySlug[row.provinceSlug] && (categoryBySlug[row.categorySlug] || fallbackCategory));
    if (!slice.length) continue;
    await prisma.$transaction(
      slice.map((row) => {
        const province = provinceBySlug[row.provinceSlug];
        const category = categoryBySlug[row.categorySlug] || fallbackCategory;
        created += 1;
        return prisma.location.upsert({
          where: { slug: row.slug },
          create: {
            slug: row.slug,
            name: row.name,
            summary: row.summary,
            latitude: row.latitude,
            longitude: row.longitude,
            categoryId: category.id,
            provinceId: province.id,
            status: "PUBLISHED",
            verificationTier: row.verificationTier || "directory",
            sourceVersion: row.sourceVersion,
            sourceConfidence: row.confidence,
            coordQuality: "directory-only",
            publishedAt: new Date(),
          },
          update: {
            verificationTier: row.verificationTier || "directory",
            latitude: row.latitude,
            longitude: row.longitude,
          },
        });
      })
    );
  }
  console.log(JSON.stringify({ ok: true, created, total: rows.length }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
