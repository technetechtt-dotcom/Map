import { describe, expect, it } from "vitest";
import { asRows, loadConnectorSource, loadNationalCatalog, trueSourceVersion } from "@/lib/ingestion/connectors";

describe("national ingestion connectors", () => {
  it("loads licensed public-directory catalogs for multiple provinces", async () => {
    const batches = await loadNationalCatalog();
    expect(batches.length).toBeGreaterThan(1);
    const rows = batches.flatMap((batch) => batch.rows);
    const provinces = new Set(rows.map((row) => row.provinceSlug));
    expect(provinces.has("gauteng")).toBe(true);
    expect(provinces.has("western-cape")).toBe(true);
    expect(rows.every((row) => row.sourceVersion && row.retrievedAt && row.confidence && row.licence)).toBe(true);
  });

  it("accepts GeoJSON FeatureCollection payloads from HTTP/API connectors", () => {
    const rows = asRows({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "API University", provinceSlug: "gauteng", categorySlug: "skills-education" },
          geometry: { type: "Point", coordinates: [28.03, -26.191] },
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      name: "API University",
      provinceSlug: "gauteng",
      latitude: -26.191,
      longitude: 28.03,
    });
  });

  it("loads from HTTP when a connector URL is configured", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            name: "HTTP University",
            provinceSlug: "western-cape",
            latitude: -33.957,
            longitude: 18.461,
            categorySlug: "skills-education",
          },
        ]),
        { status: 200, headers: { ETag: '"uni-etag-1"', "Last-Modified": "Mon, 24 Aug 2026 12:00:00 GMT" } }
      );
    process.env.INGEST_UNIVERSITIES_URL = "https://directory.example.test/universities.json";
    try {
      const rows = await loadConnectorSource({
        id: "universities",
        licence: "public-directory",
        file: "data/ingestion/universities.json",
        urlEnv: "INGEST_UNIVERSITIES_URL",
      });
      expect(rows[0]?.name).toBe("HTTP University");
      expect(rows[0]?.source).toBe("universities");
      expect(rows[0]?.licence).toBe("public-directory");
      expect(rows[0]?.sourceUrl).toBe("https://directory.example.test/universities.json");
      expect(rows[0]?.sourceVersion).toBe("uni-etag-1");
      expect(rows[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      delete process.env.INGEST_UNIVERSITIES_URL;
      globalThis.fetch = original;
    }
  });

  it("prefers ETag, then last-modified, then content hash for sourceVersion", () => {
    expect(trueSourceVersion({ etag: '"abc"', contentHash: "ffffffffffffffff" })).toBe("abc");
    expect(trueSourceVersion({ lastModified: "Mon, 24 Aug 2026", contentHash: "ffffffffffffffff" })).toBe("Mon, 24 Aug 2026");
    expect(trueSourceVersion({ contentHash: "ffffffffffffffff" })).toBe("ffffffffffffffff".slice(0, 16));
  });
});
