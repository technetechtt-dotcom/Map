import { describe, expect, it } from "vitest";
import { canReadRepositoryDocument, repositoryDocumentWhere } from "@/lib/policy";
import { missingRepositoryObjectBackups } from "@/lib/object-backup";

const member = {
  id: "user-a",
  role: "CONTRIBUTOR",
  provinceId: "prov-nc",
  organisationId: "org-a",
};
const otherOrg = {
  id: "user-b",
  role: "CONTRIBUTOR",
  provinceId: "prov-nc",
  organisationId: "org-b",
};
const outsider = {
  id: "user-c",
  role: "CONTRIBUTOR",
  provinceId: "prov-wc",
  organisationId: "org-c",
};

describe("repository tenant denial", () => {
  it("lets a group member read a group document and denies other groups", () => {
    const document = {
      uploadedById: "owner",
      organisationId: "org-a",
      provinceId: "prov-nc",
      visibility: "GROUPS",
      status: "ACTIVE",
      groupUserIds: ["user-a"],
    };
    expect(canReadRepositoryDocument(member, document)).toBe(true);
    expect(canReadRepositoryDocument(otherOrg, document)).toBe(false);
    expect(canReadRepositoryDocument(outsider, document)).toBe(false);
  });

  it("denies a different organisation even when the province matches", () => {
    const document = {
      uploadedById: "owner",
      organisationId: "org-a",
      provinceId: "prov-nc",
      visibility: "ORGANISATION",
      status: "ACTIVE",
    };
    expect(canReadRepositoryDocument(member, document)).toBe(true);
    expect(canReadRepositoryDocument(otherOrg, document)).toBe(false);
  });

  it("does not treat organisation id as access for a group-only document", () => {
    const where = repositoryDocumentWhere(member);
    const clauses = (where.OR || []) as Array<Record<string, unknown>>;
    expect(clauses.some((clause) => clause.organisationId === "org-a" && !clause.visibility)).toBe(false);
    expect(clauses).toContainEqual({ visibility: "ORGANISATION", organisationId: "org-a" });
    expect(clauses).toContainEqual({
      visibility: "GROUPS",
      groupAccess: { some: { group: { members: { some: { userId: "user-a" } } } } },
    });
  });
});

describe("repository backup coverage", () => {
  it("requires every repository file id to be present in the object backup set", () => {
    expect(missingRepositoryObjectBackups(["obj-1", "obj-2", "obj-3"], ["obj-1", "obj-2"])).toEqual([]);
    expect(missingRepositoryObjectBackups(["obj-1"], ["obj-1", "obj-repo"])).toEqual(["obj-repo"]);
  });
});
