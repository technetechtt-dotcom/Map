import { describe, expect, it } from "vitest";
import { isNavActive, PUBLIC_NAV } from "@/lib/nav";
import { applyListingFilters } from "@/lib/listing-filters";
import { makeTrackingRef, parseTrackingRef } from "@/lib/tracking";

describe("public navigation", () => {
  it("keeps a single Saved entry out of primary chips", () => {
    expect(PUBLIC_NAV.some((item) => item.label === "Saved")).toBe(false);
    expect(PUBLIC_NAV.some((item) => item.label === "Organisations")).toBe(true);
    expect(PUBLIC_NAV.some((item) => item.label === "Contacts")).toBe(false);
  });

  it("highlights parent sections on detail routes", () => {
    expect(isNavActive("/funding/sefa-grant", "/funding")).toBe(true);
    expect(isNavActive("/events/innovation-week", "/events")).toBe(true);
    expect(isNavActive("/org/seda-nc", "/organisations")).toBe(true);
    expect(isNavActive("/locations/kimberley-hub", "/")).toBe(true);
  });
});

describe("listing filters", () => {
  it("filters funding by funder and sector", () => {
    const rows = applyListingFilters("funding", [
      { title: "A", organisation: { name: "SEFA" }, tags: ["ict"], eligibleSectorsJson: ["digital"] },
      { title: "B", organisation: { name: "Other" }, tags: ["agriculture"] },
    ], { funder: "sefa", sector: "digital" });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("A");
  });
});

describe("tracking references", () => {
  it("builds and parses ICT year references", () => {
    const ref = makeTrackingRef("clxyz00452", new Date("2026-03-01"));
    expect(ref).toMatch(/^ICT-2026-/);
    expect(parseTrackingRef(ref)).toBe(ref);
    expect(parseTrackingRef("bad")).toBeNull();
  });
});
