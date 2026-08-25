import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { generate } = require("../scripts/performance/generate-scale-dataset.js") as {
  generate: (total?: number) => {
    count: number;
    provinces: string[];
    rows: Array<{ provinceSlug: string; latitude: number; longitude: number; slug: string }>;
    organisations: Array<{ slug: string; provinceSlug: string }>;
    funding: Array<{ slug: string }>;
    events: Array<{ slug: string }>;
    programmes: Array<{ slug: string }>;
  };
};

describe("production-scale dataset generator", () => {
  it("covers all nine provinces without touching Neon", () => {
    const dataset = generate(90);
    expect(dataset.count).toBe(90);
    expect(dataset.provinces).toHaveLength(9);
    expect(new Set(dataset.rows.map((row) => row.provinceSlug)).size).toBe(9);
    expect(dataset.rows.every((row) => row.latitude && row.longitude && row.slug)).toBe(true);
    expect(dataset.organisations.length).toBeGreaterThanOrEqual(20);
    expect(dataset.funding.length).toBeGreaterThan(0);
    expect(dataset.events.length).toBeGreaterThan(0);
    expect(dataset.programmes.length).toBeGreaterThan(0);
  });
});
