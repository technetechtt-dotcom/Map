#!/usr/bin/env node
/**
 * Generate a production-shaped catalog for isolated load tests.
 * Covers locations plus organisations, funding, events, and programmes.
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
const ORG_TYPES = ["Training", "Digital hub", "Government", "Funding", "Education"];

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

function jitter(i, lat, lng) {
  const jitterLat = ((i * 17) % 200) / 1000 - 0.1;
  const jitterLng = ((i * 13) % 200) / 1000 - 0.1;
  return {
    latitude: Number((lat + jitterLat).toFixed(5)),
    longitude: Number((lng + jitterLng).toFixed(5)),
  };
}

function generateLocations(total) {
  const rows = [];
  for (let i = 0; i < total; i += 1) {
    const province = PROVINCES[i % PROVINCES.length];
    const coords = jitter(i, province.lat, province.lng);
    const name = `Scale site ${i + 1}`;
    rows.push({
      slug: `${slugify(name)}-${province.slug}-${i}`,
      name,
      summary: "Generated production-scale pin for isolated load tests.",
      ...coords,
      provinceSlug: province.slug,
      categorySlug: CATEGORIES[i % CATEGORIES.length],
      verificationTier: i % 11 === 0 ? "desktop" : "directory",
      source: "scale-generator",
      sourceVersion: "scale-2026-08",
      confidence: "public-directory",
    });
  }
  return rows;
}

function generateRelated(locationCount) {
  const orgCount = Math.max(20, Math.floor(locationCount / 20));
  const organisations = [];
  for (let i = 0; i < orgCount; i += 1) {
    const province = PROVINCES[i % PROVINCES.length];
    const coords = jitter(i + 9000, province.lat, province.lng);
    organisations.push({
      slug: `scale-org-${province.slug}-${i}`,
      name: `Scale organisation ${i + 1}`,
      type: ORG_TYPES[i % ORG_TYPES.length],
      description: "Generated organisation for isolated load tests.",
      provinceSlug: province.slug,
      ...coords,
      verificationTier: i % 7 === 0 ? "desktop" : "directory",
    });
  }
  const funding = organisations.slice(0, Math.max(10, Math.floor(orgCount / 2))).map((org, i) => ({
    slug: `scale-funding-${org.provinceSlug}-${i}`,
    title: `Scale funding call ${i + 1}`,
    summary: "Generated funding call for isolated load tests.",
    provinceSlug: org.provinceSlug,
    organisationSlug: org.slug,
  }));
  const events = organisations.slice(0, Math.max(10, Math.floor(orgCount / 2))).map((org, i) => ({
    slug: `scale-event-${org.provinceSlug}-${i}`,
    title: `Scale event ${i + 1}`,
    summary: "Generated event for isolated load tests.",
    provinceSlug: org.provinceSlug,
    organisationSlug: org.slug,
    startsAt: new Date(Date.UTC(2026, 8, 1 + (i % 20))).toISOString(),
  }));
  const programmes = organisations.slice(0, Math.max(8, Math.floor(orgCount / 3))).map((org, i) => ({
    slug: `scale-programme-${org.provinceSlug}-${i}`,
    title: `Scale programme ${i + 1}`,
    summary: "Generated programme for isolated load tests.",
    provinceSlug: org.provinceSlug,
    organisationSlug: org.slug,
  }));
  return { organisations, funding, events, programmes };
}

function generate(total = count()) {
  const related = generateRelated(total);
  return {
    generatedAt: new Date().toISOString(),
    count: total,
    provinces: PROVINCES.map((row) => row.slug),
    rows: generateLocations(total),
    organisations: related.organisations,
    funding: related.funding,
    events: related.events,
    programmes: related.programmes,
  };
}

function write(dataset = generate()) {
  const outDir = path.join(process.cwd(), "data", "performance");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "generated-locations.json");
  fs.writeFileSync(outFile, JSON.stringify(dataset));
  return {
    outFile,
    count: dataset.count,
    organisations: dataset.organisations.length,
    funding: dataset.funding.length,
    events: dataset.events.length,
    programmes: dataset.programmes.length,
  };
}

if (require.main === module) {
  const result = write();
  console.log(JSON.stringify({ ok: true, ...result }));
}

module.exports = { generate, write, PROVINCES, count };
