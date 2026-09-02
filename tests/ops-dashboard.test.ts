import { describe, expect, it } from "vitest";
import { canAccessOpsDashboard } from "@/lib/policy";
import { opsJobsForRole, runtimeReadiness, runtimeSecretPresence } from "@/lib/ops-dashboard";

describe("ops dashboard access", () => {
  it("is limited to super and provincial administrators", () => {
    expect(canAccessOpsDashboard({ id: "s", role: "SUPER_ADMIN" })).toBe(true);
    expect(canAccessOpsDashboard({ id: "p", role: "PROVINCIAL_ADMIN", provinceId: "nc" })).toBe(true);
    expect(canAccessOpsDashboard({ id: "o", role: "ORG_ADMIN" })).toBe(false);
    expect(canAccessOpsDashboard({ id: "c", role: "CONTRIBUTOR" })).toBe(false);
  });

  it("gives provincial admins tenant jobs only", () => {
    expect(opsJobsForRole({ id: "p", role: "PROVINCIAL_ADMIN" })).toEqual(["expiry", "geocode", "analytics", "report"]);
    expect(opsJobsForRole({ id: "s", role: "SUPER_ADMIN" })).toContain("ingest");
    expect(opsJobsForRole({ id: "s", role: "SUPER_ADMIN" })).toContain("backup");
  });
});

describe("ops runtime readiness", () => {
  it("reports named missing secrets without values", () => {
    const secrets = runtimeSecretPresence({
      NEXTAUTH_SECRET: "super-secret-value",
      DATABASE_URL: "postgresql://example",
    });
    expect(secrets.NEXTAUTH_SECRET).toBe(true);
    expect(secrets.BACKUP_ENCRYPTION_KEY).toBe(false);
    expect(JSON.stringify(secrets)).not.toMatch(/super-secret-value/);
    expect(JSON.stringify(secrets)).not.toMatch(/postgresql:\/\//);

    const readiness = runtimeReadiness({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "super-secret-value",
    });
    expect(readiness.bootGaps.length).toBeGreaterThan(0);
    expect(JSON.stringify(readiness)).not.toMatch(/super-secret-value/);
  });
});
