import { describe, expect, it } from "vitest";
import { resolveCapitalPins } from "@/lib/nc-capitals";

describe("province overview pins from live locations", () => {
  it("builds one pin per district from DB coordinates only", () => {
    const pins = resolveCapitalPins([
      {
        slug: "kimberley",
        name: "Kimberley",
        latitude: -28.7,
        longitude: 24.8,
        district: { name: "Frances Baard" },
        category: { name: "Knowledge hub" },
      },
      {
        slug: "upington",
        name: "Upington",
        latitude: -28.4,
        longitude: 21.2,
        district: { name: "ZF Mgcawu" },
      },
      {
        slug: "kimberley-hub",
        name: "Kimberley Hub",
        latitude: -28.71,
        longitude: 24.81,
        district: { name: "Frances Baard" },
      },
    ]);
    expect(pins).toHaveLength(2);
    expect(pins[0].name).toBe("Kimberley");
    expect(pins[0].latitude).toBe(-28.7);
    expect(pins[1].name).toBe("Upington");
  });

  it("omits locations without coordinates", () => {
    expect(resolveCapitalPins([{ slug: "x", name: "X", latitude: null, longitude: null }])).toEqual([]);
  });
});
