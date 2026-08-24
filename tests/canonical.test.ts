import { describe, expect, it } from "vitest";
import { canonicalEntityKey, snapshotEntity } from "@/lib/ingestion/resolve";

describe("canonical entity resolution", () => {
  it("collapses name, province and rounded coordinates onto one key", () => {
    const a = canonicalEntityKey({
      name: "University of Pretoria",
      provinceSlug: "gauteng",
      latitude: -25.7541,
      longitude: 28.2314,
    });
    const b = canonicalEntityKey({
      name: "University of Pretoria",
      provinceSlug: "gauteng",
      latitude: -25.7544,
      longitude: 28.2312,
    });
    expect(a).toBe(b);
    expect(a).toContain("gauteng|university-of-pretoria|");
  });

  it("snapshots provenance fields for change history", () => {
    expect(
      snapshotEntity({
        name: "UCT",
        latitude: -33.957,
        sourceVersion: "universities-2026-08-24",
        verificationTier: "directory",
      })
    ).toMatchObject({
      name: "UCT",
      sourceVersion: "universities-2026-08-24",
      verificationTier: "directory",
    });
  });
});
