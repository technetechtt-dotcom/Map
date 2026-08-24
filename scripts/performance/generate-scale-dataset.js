#!/usr/bin/env node
/**
 * Generate a production-shaped location catalog for isolated load tests.
 * Never writes to Neon. Output is gitignored.
 */
const fs = require("fs");
const path = require("path");

const PROVINCES = [
  { slug: "western-cape", lat: -33.92, lng: 18.42 },
  { slug: "eastern-cape", lat: -32.97, lng: 27.87 },
  { slug: "northern-cape", lat: -28.73, lng: 24.76 },
  { slug: "free-state", lat: -29.12, lng: 26.22 },
  { slug: "kwazulu-natal", lat: -29.86, lng: 31.03 },
  { slug: "north-west", lat: -25.86, lng: 25.64 },
  { slug: "gauteng", lat: -26.2, lng: 28.04 },
  { slug: "mpumalanga", lat: -25.47, lng: 30.98 },
  { slug: "limpopo", lat: -23.9, lng: 29.45 },
];

const CATEGORIES = ["skills-education", "innovation-hubs", "government", "funding", "other"];

function count() {
  const raw = Number(process.env.SCALE_LOCATIONS || 5000);
  return Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 50), 100_000) : 5000;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function generate(total = count()) {
  const rows = [];
  for (let i = 0; i < total; i += 1) {
    const province = PROVINCES[i % PROVINCES.length];
    const jitterLat = ((i * 17) % 200) / 1000 - 0.1;
    const jitterLng = ((i * 13) % 200) / 1000 - 0.1;
    const name = `Scale site ${i + 1}`;
    rows.push({
      slug: `${slugify(name)}-${province.slug}-${i}`,
      name,
      summary: "Generated production-scale pin for isolated load tests.",
      latitude: Number((province.lat + jitterLat).toFixed(5)),
      longitude: Number((province.lng + jitterLng).toFixed(5)),
      provinceSlug: province.slug,
      categorySlug: CATEGORIES[i % CATEGORIES.length],
      verificationTier: i % 11 === 0 ? "desktop" : "directory",
      source: "scale-generator",
      sourceVersion: "scale-2026-08",
      confidence: "public-directory",
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    provinces: PROVINCES.map((row) => row.slug),
    rows,
  };
}

function write(dataset = generate()) {
  const outDir = path.join(process.cwd(), "data", "performance");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "generated-locations.json");
  fs.writeFileSync(outFile, JSON.stringify(dataset));
  return { outFile, count: dataset.count };
}

if (require.main === module) {
  const result = write();
  console.log(JSON.stringify({ ok: true, ...result }));
}

module.exports = { generate, write, PROVINCES, count };
