import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { libpqUrl } = require("./scripts/pg-url.js") as { libpqUrl: (url: string) => string };

describe("libpq URL sanitizer", () => {
  it("strips Prisma schema and pooler flags that pg_dump rejects", () => {
    const url = libpqUrl("postgresql://postgres:postgres@localhost:5432/ictmap?schema=public&pgbouncer=true&sslmode=require");
    expect(url).toContain("sslmode=require");
    expect(url).not.toContain("schema=");
    expect(url).not.toContain("pgbouncer=");
  });

  it("keeps a clean URL unchanged", () => {
    const url = "postgres://postgres:postgres@localhost:5432/ictmap";
    expect(libpqUrl(url)).toBe(url);
  });
});
