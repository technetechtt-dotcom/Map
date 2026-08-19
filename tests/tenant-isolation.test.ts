import { describe, expect, it } from "vitest";
import {
  assertLocationAccess,
  assertOrganisationAccess,
  assertProvinceAccess,
  tenantWhere,
} from "@/lib/policy";

describe("tenant isolation policy", () => {
  const orgA = { id: "u1", role: "ORG_ADMIN", organisationId: "org-a", provinceId: "prov-a" };
  const orgBRecord = { id: "loc1", provinceId: "prov-a", organisationId: "org-b", ownerId: "other" };
  const provA = { id: "u2", role: "PROVINCIAL_ADMIN", provinceId: "prov-a" };
  const contribA = { id: "u3", role: "CONTRIBUTOR", organisationId: "org-a", provinceId: "prov-a" };

  it("blocks Org Admin A from Org B records", () => {
    expect(assertOrganisationAccess(orgA, "org-b").ok).toBe(false);
    expect(assertLocationAccess(orgA, orgBRecord, "write").ok).toBe(false);
  });

  it("blocks Provincial Admin A from Province B", () => {
    expect(assertProvinceAccess(provA, "prov-b").ok).toBe(false);
  });

  it("blocks Contributor A from Contributor B drafts", () => {
    expect(assertLocationAccess(contribA, { provinceId: "prov-a", organisationId: "org-a", ownerId: "someone-else" }, "read").ok).toBe(false);
  });

  it("scopes tenant filters so unbound admins see nothing", () => {
    expect(tenantWhere({ id: "x", role: "PROVINCIAL_ADMIN" })).toEqual({ id: "__none__" });
    expect(tenantWhere({ id: "x", role: "ORG_ADMIN" })).toEqual({ id: "__none__" });
  });
});
