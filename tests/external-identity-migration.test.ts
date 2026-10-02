import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preflightPath = resolve(
  process.cwd(),
  "prisma/migrations/20260902130000_external_identity_preflight/migration.sql"
);
const preflight = readFileSync(preflightPath, "utf8");
const destructiveMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260902140000_external_identity_only/migration.sql"
);

describe("ExternalIdentity migration", () => {
  it("fails on contradictory legacy identity mappings before conflict suppression", () => {
    const destructiveMigration = readFileSync(destructiveMigrationPath, "utf8");
    const preflightOrder = preflightPath.localeCompare(destructiveMigrationPath);

    expect(preflightOrder).toBeLessThan(0);
    expect(destructiveMigration).toContain("ON CONFLICT (");
    expect(preflight).toContain('HAVING COUNT(DISTINCT "entityId") > 1');
    expect(preflight).toContain("FROM \"ExternalIdentity\"");
    expect(preflight).toContain("RAISE EXCEPTION");
    expect(preflight).toContain("ERRCODE = '23505'");
  });

  it("runs the read-only collision preflight before prisma migrate deploy", () => {
    const runner = readFileSync(resolve(process.cwd(), "scripts/production-migrate-smoke.js"), "utf8");
    expect(runner.indexOf("external-identity-preflight.js")).toBeGreaterThan(-1);
    expect(runner.indexOf("external-identity-preflight.js")).toBeLessThan(runner.indexOf("prisma migrate deploy"));
  });
});
