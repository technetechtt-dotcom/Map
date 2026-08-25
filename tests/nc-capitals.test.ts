import { describe, expect, it } from "vitest";
import { NC_CAPITAL_CITIES, resolveCapitalPins } from "@/lib/nc-capitals";

describe("Northern Cape capital-city pins", () => {
  it("pins the five overview capitals in the requested order", () => {
    expect(NC_CAPITAL_CITIES.map((c) => c.name)).toEqual([
      "Kimberley",
      "Kuruman",
      "Kathu",
      "Upington",
      "Springbok",
    ]);
  });

  it("uses live location coordinates when present", () => {
    const pins = resolveCapitalPins([
      { slug: "kimberley", name: "Kimberley", latitude: -28.7, longitude: 24.8 },
    ]);
    expect(pins[0].latitude).toBe(-28.7);
    expect(pins[0].longitude).toBe(24.8);
    expect(pins[1].name).toBe("Kuruman");
    expect(pins[1].latitude).toBe(NC_CAPITAL_CITIES[1].fallback.latitude);
  });
});
