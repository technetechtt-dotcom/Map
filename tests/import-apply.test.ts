import { describe, expect, it } from "vitest";
import { parseLatitude, parseLongitude } from "@/lib/coords";
import { mergeExistingLocation, resolveImportRowStates, canonicalKeyForImport } from "@/lib/import-apply";
import { snapshotSettingKey } from "@/lib/jobs";

describe("import coordinates", () => {
  it("rejects non-finite and out-of-range WGS84 values", () => {
    expect(parseLatitude("999")).toBeNull();
    expect(parseLongitude("999")).toBeNull();
    expect(parseLatitude("not-a-number")).toBeNull();
    expect(parseLatitude(-28.7)).toBe(-28.7);
    expect(parseLongitude(24.7)).toBe(24.7);
  });
});

describe("import apply staging flags", () => {
  it("skips rows that failed staging even if they remain in payloadJson", () => {
    const rows = [
      { name: "Bad", latitude: 999, longitude: 24.7 },
      { name: "Good", latitude: -28.7, longitude: 24.7 },
    ];
    const states = resolveImportRowStates(
      {
        rows: [
          { index: 0, ok: false, issues: ["coordinates outside assigned province boundary"] },
          { index: 1, ok: true, issues: [] },
        ],
      },
      rows
    );
    expect(states[0].status).toBe("SKIPPED");
    expect(states[0].error).toMatch(/boundary/);
    expect(states[1].status).toBe("PENDING");
  });
});

describe("existing-record merge policy", () => {
  const existing = {
    id: "loc-1",
    slug: "uct",
    name: "University of Cape Town",
    summary: "Desktop verified campus",
    latitude: -33.957,
    longitude: 18.461,
    address: "Rondebosch",
    website: "https://uct.ac.za",
    verificationTier: "desktop",
    lastVerifiedAt: new Date("2026-08-01"),
    verificationExpiresAt: new Date("2027-08-01"),
    coordQuality: "verified",
    coordSource: "field",
  };

  it("does not overwrite coordinates or name on desktop/field records", () => {
    const merged = mergeExistingLocation(
      existing,
      {
        name: "UCT directory alias",
        summary: "Directory summary",
        latitude: -26.1,
        longitude: 28.1,
        address: "Cape Town",
        website: "https://directory.example/uct",
      },
      { verificationTier: "directory", coordQuality: "directory-only", coordSource: "universities" }
    );
    expect(merged).toMatchObject({
      name: "University of Cape Town",
      latitude: -33.957,
      longitude: 18.461,
      verificationTier: "desktop",
      coordQuality: "verified",
      website: "https://uct.ac.za",
      summary: "Desktop verified campus",
      address: "Rondebosch",
    });
  });

  it("fills coordinates on unprotected directory records", () => {
    const merged = mergeExistingLocation(
      { ...existing, verificationTier: "directory", coordQuality: "directory-only" },
      { name: "UCT", summary: "Updated", latitude: -33.96, longitude: 18.46 },
      { verificationTier: "directory" }
    );
    expect(merged.latitude).toBe(-33.96);
    expect(merged.longitude).toBe(18.46);
  });

  it("keeps verified canonical identity when a directory supplies different coordinates", () => {
    expect(
      canonicalKeyForImport({
        existing,
        name: "UCT directory alias",
        provinceSlug: "western-cape",
        latitude: -26.1,
        longitude: 28.1,
      })
    ).toBe("western-cape|university-of-cape-town|-33.957|18.461");
  });
});

describe("job snapshot keys", () => {
  it("namespaces cached results by province", () => {
    expect(snapshotSettingKey("analytics.daily")).toBe("analytics.daily:national");
    expect(snapshotSettingKey("analytics.daily", "prov-nc")).toBe("analytics.daily:prov-nc");
    expect(snapshotSettingKey("duplicates.latest", "prov-nc")).toBe("duplicates.latest:prov-nc");
    expect(snapshotSettingKey("reports.latest")).toBe("reports.latest:national");
  });
});
