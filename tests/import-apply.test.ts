import { describe, expect, it } from "vitest";
import { parseLatitude, parseLongitude } from "@/lib/coords";
import { resolveImportRowStates } from "@/lib/import-apply";
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

describe("job snapshot keys", () => {
  it("namespaces cached results by province", () => {
    expect(snapshotSettingKey("analytics.daily")).toBe("analytics.daily:national");
    expect(snapshotSettingKey("analytics.daily", "prov-nc")).toBe("analytics.daily:prov-nc");
    expect(snapshotSettingKey("duplicates.latest", "prov-nc")).toBe("duplicates.latest:prov-nc");
    expect(snapshotSettingKey("reports.latest")).toBe("reports.latest:national");
  });
});
