import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { generate } = require("../scripts/performance/generate-scale-dataset.js") as {
  generate: (total?: number) => {
    count: number;
    provinces: string[];
    rows: Array<{ provinceSlug: string; latitude: number; longitude: number; slug: string }>;
  };
};

describe("production-scale dataset generator", () => {
  it("covers all nine provinces without touching Neon", () => {
    const dataset = generate(90);
    expect(dataset.count).toBe(90);
    expect(dataset.provinces).toHaveLength(9);
    expect(new Set(dataset.rows.map((row) => row.provinceSlug)).size).toBe(9);
    expect(dataset.rows.every((row) => row.latitude && row.longitude && row.slug)).toBe(true);
  });
});
