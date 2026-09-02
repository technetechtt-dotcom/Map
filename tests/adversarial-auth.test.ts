import { describe, expect, it } from "vitest";
import {
  assertEcosystemAccess,
  assertEcosystemAssignmentChange,
  assertLocationAccess,
  assertLocationAssignmentChange,
  assertOrganisationAccess,
  assertProvinceAccess,
  canManageBackups,
  canManageUsers,
  ecosystemTenantWhere,
  submissionTenantWhere,
  tenantWhere,
} from "@/lib/policy";

const superAdmin = { id: "s1", role: "SUPER_ADMIN", provinceId: null, organisationId: null };
const ncAdmin = { id: "p1", role: "PROVINCIAL_ADMIN", provinceId: "prov-nc", organisationId: null };
const gpAdmin = { id: "p2", role: "PROVINCIAL_ADMIN", provinceId: "prov-gp", organisationId: null };
const orgA = { id: "o1", role: "ORG_ADMIN", provinceId: "prov-nc", organisationId: "org-a" };
const orgB = { id: "o2", role: "ORG_ADMIN", provinceId: "prov-nc", organisationId: "org-b" };
const contribA = { id: "c1", role: "CONTRIBUTOR", provinceId: "prov-nc", organisationId: "org-a" };
const contribB = { id: "c2", role: "CONTRIBUTOR", provinceId: "prov-nc", organisationId: "org-b" };

describe("adversarial authorization — locations", () => {
  const locB = { provinceId: "prov-nc", organisationId: "org-b", ownerId: "c2", status: "DRAFT" };

  it("blocks contributor modifying another org location", () => {
    expect(assertLocationAccess(contribA, locB, "write").ok).toBe(false);
  });
  it("blocks org admin on another org location", () => {
    expect(assertLocationAccess(orgA, locB, "write").ok).toBe(false);
  });
  it("blocks provincial admin cross-province", () => {
    expect(assertProvinceAccess(gpAdmin, "prov-nc").ok).toBe(false);
  });
  it("blocks contributor reading unpublished record owned by peer", () => {
    expect(assertLocationAccess(contribA, { ...locB, ownerId: "c2" }, "read").ok).toBe(false);
  });
  it("blocks assignment claim of unassigned location", () => {
    const unassigned = { provinceId: "prov-nc", organisationId: null, ownerId: null };
    expect(assertLocationAssignmentChange(orgA, unassigned, "org-a", "prov-nc").ok).toBe(false);
  });
  it("blocks guessed-id style cross-tenant write on foreign owned record", () => {
    expect(assertLocationAccess(contribA, locB, "write").ok).toBe(false);
  });
});

describe("adversarial authorization — organisations", () => {
  it("blocks org admin touching another organisation", () => {
    expect(assertOrganisationAccess(orgA, "org-b").ok).toBe(false);
  });
  it("blocks contributor with wrong org on org-scoped record", () => {
    expect(assertOrganisationAccess(contribA, "org-b").ok).toBe(false);
  });
});

describe("adversarial authorization — submissions and admin surfaces", () => {
  it("scopes submissions to provincial tenant", () => {
    expect(submissionTenantWhere(ncAdmin)).toEqual({ provinceId: "prov-nc" });
    expect(submissionTenantWhere(orgA)).toEqual({ id: "__none__" });
  });
  it("denies backup management to provincial admin", () => {
    expect(canManageBackups(ncAdmin)).toBe(false);
    expect(canManageBackups(superAdmin)).toBe(true);
  });
  it("denies user management to org admin", () => {
    expect(canManageUsers(orgA)).toBe(false);
    expect(canManageUsers(ncAdmin)).toBe(true);
  });
});

describe("adversarial authorization — ecosystem", () => {
  const recB = { provinceId: "prov-nc", organisationId: "org-b", status: "DRAFT" };
  const draftUnpub = { provinceId: "prov-gp", organisationId: "org-x", status: "DRAFT" };

  it("contributor cannot access another organisation ecosystem record", () => {
    expect(assertEcosystemAccess(contribA, recB, "write").ok).toBe(false);
  });
  it("provincial admin cannot access another province", () => {
    expect(assertEcosystemAccess(ncAdmin, draftUnpub, "write").ok).toBe(false);
  });
  it("blocks assignment manipulation across orgs", () => {
    const unassigned = { provinceId: "prov-nc", organisationId: null, status: "DRAFT" };
    expect(assertEcosystemAssignmentChange(orgA, unassigned, "org-a", "prov-nc").ok).toBe(false);
  });
  it("manage list tenant filter excludes cross-org rows for org admin", () => {
    expect(ecosystemTenantWhere(orgA)).toEqual({ organisationId: "org-a" });
    expect(ecosystemTenantWhere(orgB)).toEqual({ organisationId: "org-b" });
  });
});

describe("adversarial authorization — list scoping", () => {
  it("contributor tenantWhere is owner-only", () => {
    expect(tenantWhere(contribA)).toEqual({ ownerId: "c1" });
    expect(tenantWhere(contribB)).toEqual({ ownerId: "c2" });
  });
  it("unbound org admin gets deny-all filter", () => {
    expect(tenantWhere({ id: "x", role: "ORG_ADMIN", provinceId: "prov-nc", organisationId: null })).toEqual({
      id: "__none__",
    });
  });
});
