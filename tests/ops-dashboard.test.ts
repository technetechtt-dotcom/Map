import { describe, expect, it } from "vitest";
import { canAccessOpsDashboard } from "@/lib/policy";
import { opsJobsForRole } from "@/lib/ops-dashboard";

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
