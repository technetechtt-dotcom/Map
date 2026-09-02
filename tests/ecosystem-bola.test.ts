import { describe, expect, it } from "vitest";
import {
  assertEcosystemAccess,
  assertEcosystemAssignmentChange,
  ecosystemTenantWhere,
} from "@/lib/policy";

const superAdmin = { id: "s1", role: "SUPER_ADMIN", provinceId: null, organisationId: null };
const ncAdmin = { id: "p1", role: "PROVINCIAL_ADMIN", provinceId: "prov-nc", organisationId: null };
const ncAdminOther = { id: "p2", role: "PROVINCIAL_ADMIN", provinceId: "prov-gp", organisationId: null };
const orgA = { id: "o1", role: "ORG_ADMIN", provinceId: "prov-nc", organisationId: "org-a" };
const orgB = { id: "o2", role: "ORG_ADMIN", provinceId: "prov-nc", organisationId: "org-b" };
const contribA = { id: "c1", role: "CONTRIBUTOR", provinceId: "prov-nc", organisationId: "org-a" };

describe("ecosystem tenant isolation", () => {
  const recordA = { id: "r1", provinceId: "prov-nc", organisationId: "org-a", status: "DRAFT" };
  const recordB = { id: "r2", provinceId: "prov-nc", organisationId: "org-b", status: "DRAFT" };
  const unassigned = { id: "r3", provinceId: "prov-nc", organisationId: null, status: "DRAFT" };

  it("blocks cross-province provincial admin", () => {
    expect(assertEcosystemAccess(ncAdminOther, recordA, "write").ok).toBe(false);
  });

  it("blocks cross-org org admin (BOLA)", () => {
    expect(assertEcosystemAccess(orgA, recordB, "write").ok).toBe(false);
    expect(assertEcosystemAccess(orgB, recordA, "write").ok).toBe(false);
  });

  it("blocks org admin on unassigned records", () => {
    expect(assertEcosystemAccess(orgA, unassigned, "write").ok).toBe(false);
  });

  it("blocks contributor outside own organisation", () => {
    expect(assertEcosystemAccess(contribA, recordB, "write").ok).toBe(false);
    expect(assertEcosystemAccess(contribA, recordA, "write").ok).toBe(true);
  });

  it("allows super admin everywhere", () => {
    expect(assertEcosystemAccess(superAdmin, recordB, "write").ok).toBe(true);
  });

  it("denies unbound org admin lists", () => {
    expect(ecosystemTenantWhere({ id: "x", role: "ORG_ADMIN", provinceId: "prov-nc", organisationId: null })).toEqual({
      id: "__none__",
    });
  });

  it("scopes provincial admin by province", () => {
    expect(ecosystemTenantWhere(ncAdmin)).toEqual({ provinceId: "prov-nc" });
  });

  it("blocks org claim via assignment change", () => {
    expect(assertEcosystemAssignmentChange(orgA, unassigned, "org-a", "prov-nc").ok).toBe(false);
  });
});
