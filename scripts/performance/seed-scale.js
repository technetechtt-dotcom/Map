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

async function upsertChunk(items, mapper) {
  const chunk = 100;
  let created = 0;
  for (let i = 0; i < items.length; i += chunk) {
    const slice = items.slice(i, i + chunk).map(mapper).filter(Boolean);
    if (!slice.length) continue;
    await prisma.$transaction(slice);
    created += slice.length;
  }
  return created;
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
  const organisations = Array.isArray(dataset.organisations) ? dataset.organisations : [];
  const funding = Array.isArray(dataset.funding) ? dataset.funding : [];
  const events = Array.isArray(dataset.events) ? dataset.events : [];
  const programmes = Array.isArray(dataset.programmes) ? dataset.programmes : [];
  const [provinces, categories] = await Promise.all([
    prisma.province.findMany(),
    prisma.category.findMany(),
  ]);
  const provinceBySlug = Object.fromEntries(provinces.map((row) => [row.slug, row]));
  const categoryBySlug = Object.fromEntries(categories.map((row) => [row.slug, row]));
  const fallbackCategory = categories[0];
  const expiresAt = new Date(Date.now() + 365 * 24 * 3600_000);

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
            lastVerifiedAt: row.verificationTier === "desktop" ? new Date() : null,
            verificationExpiresAt: row.verificationTier === "desktop" ? expiresAt : null,
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

  const orgCreated = await upsertChunk(organisations, (row) => {
    const province = provinceBySlug[row.provinceSlug];
    if (!province) return null;
    const verified = row.verificationTier === "desktop" || row.verificationTier === "field";
    return prisma.organisation.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        name: row.name,
        type: row.type,
        description: row.description || null,
        provinceId: province.id,
        latitude: row.latitude,
        longitude: row.longitude,
        status: "PUBLISHED",
        verificationTier: row.verificationTier || "directory",
        verified,
        verifiedAt: verified ? new Date() : null,
        lastVerifiedAt: verified ? new Date() : null,
        verificationExpiresAt: verified ? expiresAt : null,
      },
      update: {
        verificationTier: row.verificationTier || "directory",
        latitude: row.latitude,
        longitude: row.longitude,
      },
    });
  });
  const orgRows = await prisma.organisation.findMany({
    where: { slug: { startsWith: "scale-org-" } },
    select: { id: true, slug: true },
  });
  const orgBySlug = Object.fromEntries(orgRows.map((row) => [row.slug, row]));

  const fundingCreated = await upsertChunk(funding, (row) => {
    const province = provinceBySlug[row.provinceSlug];
    if (!province) return null;
    return prisma.fundingCall.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        provinceId: province.id,
        organisationId: orgBySlug[row.organisationSlug]?.id || null,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      update: { title: row.title, summary: row.summary },
    });
  });
  const eventsCreated = await upsertChunk(events, (row) => {
    const province = provinceBySlug[row.provinceSlug];
    if (!province) return null;
    return prisma.ecosystemEvent.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        startsAt: new Date(row.startsAt || Date.now()),
        provinceId: province.id,
        organisationId: orgBySlug[row.organisationSlug]?.id || null,
        status: "PUBLISHED",
      },
      update: { title: row.title, summary: row.summary },
    });
  });
  const programmesCreated = await upsertChunk(programmes, (row) => {
    const province = provinceBySlug[row.provinceSlug];
    if (!province) return null;
    return prisma.programme.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        provinceId: province.id,
        organisationId: orgBySlug[row.organisationSlug]?.id || null,
        status: "PUBLISHED",
      },
      update: { title: row.title, summary: row.summary },
    });
  });

  console.log(JSON.stringify({
    ok: true,
    created,
    total: rows.length,
    organisations: orgCreated,
    funding: fundingCreated,
    events: eventsCreated,
    programmes: programmesCreated,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
