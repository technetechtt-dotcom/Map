import { describe, expect, it } from "vitest";
import { pointInGeoJson } from "@/lib/geo-validation";

describe("administrative boundary validation", () => {
  const polygon = { type: "Polygon", coordinates: [[[20, -30], [25, -30], [25, -25], [20, -25], [20, -30]]] };
  it("accepts points inside and flags points outside", () => {
    expect(pointInGeoJson(22, -28, polygon)).toBe(true);
    expect(pointInGeoJson(28, -28, polygon)).toBe(false);
  });
  it("returns null for unavailable geometry", () => {
    expect(pointInGeoJson(22, -28, null)).toBeNull();
  });
});
