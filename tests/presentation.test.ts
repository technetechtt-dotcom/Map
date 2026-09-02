import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "../src/lib/brand";
import { SEED_CATALOGUE } from "../src/lib/catalogue";
import { t } from "../src/lib/i18n";

const presentation = createRequire(import.meta.url)("../data/seed/presentation") as {
  publicTitle: string;
  ncReviewedAt: string;
  ncExpiresAt: string;
};

describe("presentation catalogue", () => {
  it("uses one product name", () => {
    expect(PRODUCT_NAME).toBe("SA ICT Ecosystem Map");
    expect(presentation.publicTitle).toBe(PRODUCT_NAME);
    expect(t("en", "brand")).toBe(PRODUCT_NAME);
  });

  it("does not inflate live seed counts", () => {
    expect(SEED_CATALOGUE.ncTowns).toBe(9);
    expect(SEED_CATALOGUE.pdfOrganisations).toBe(49);
    expect(SEED_CATALOGUE.nationalDirectoryPins).toBe(94);
    const live = SEED_CATALOGUE.ncTowns + SEED_CATALOGUE.pdfOrganisations + SEED_CATALOGUE.nationalDirectoryPins;
    expect(live).toBe(152);
    expect(SEED_CATALOGUE.ncTowns).toBeLessThan(20);
  });

  it("sets a current desktop-verification window on curated NC towns", () => {
    expect(presentation.ncReviewedAt).toBe("2026-08-21");
    expect(new Date(presentation.ncExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
