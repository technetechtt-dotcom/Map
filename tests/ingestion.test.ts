import { describe, expect, it } from "vitest";
import { loadNationalCatalog } from "@/lib/ingestion/connectors";

describe("national ingestion connectors", () => {
  it("loads licensed public-directory catalogs for multiple provinces", async () => {
    const batches = await loadNationalCatalog();
    expect(batches.length).toBeGreaterThan(1);
    const rows = batches.flatMap((batch) => batch.rows);
    const provinces = new Set(rows.map((row) => row.provinceSlug));
    expect(provinces.has("gauteng")).toBe(true);
    expect(provinces.has("western-cape")).toBe(true);
    expect(rows.every((row) => row.sourceVersion && row.retrievedAt && row.confidence)).toBe(true);
  });
});
