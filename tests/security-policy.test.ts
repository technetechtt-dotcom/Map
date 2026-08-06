import { describe, expect, it } from "vitest";
import {
  assertLocationAccess,
  assertLocationAssignmentChange,
  assertOrganisationAccess,
  assertProvinceAccess,
  assertStatusChange,
  canPublish,
  canVerify,
  coerceCreateStatus,
  tenantWhere,
  submissionTenantWhere,
  auditTenantWhere,
  PUBLIC_LOCATION_STATUSES,
} from "@/lib/policy";
import { escapeHtml, escapeAttr } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { encryptBackupJson, decryptBackupBlob } from "@/lib/backup-crypto";

const superAdmin = {
  id: "u1",
  role: "SUPER_ADMIN",
  provinceId: null,
  organisationId: null,
};
const ncAdmin = {
  id: "u2",
  role: "PROVINCIAL_ADMIN",
  provinceId: "prov-nc",
  organisationId: null,
};
const ncAdminUnbound = {
  id: "u2b",
  role: "PROVINCIAL_ADMIN",
  provinceId: null,
  organisationId: null,
};
const orgAdmin = {
  id: "u3",
  role: "ORG_ADMIN",
  provinceId: "prov-nc",
  organisationId: "org-1",
};
const orgAdminUnbound = {
  id: "u3b",
  role: "ORG_ADMIN",
  provinceId: "prov-nc",
  organisationId: null,
};
const contributor = {
  id: "u4",
  role: "CONTRIBUTOR",
  provinceId: "prov-nc",
  organisationId: "org-1",
};
const contributor2 = {
  id: "u5",
  role: "CONTRIBUTOR",
  provinceId: "prov-nc",
  organisationId: "org-1",
};

describe("deny-on-null tenant policy", () => {
  it("denies provincial admin without province", () => {
    expect(assertProvinceAccess(ncAdminUnbound, "prov-nc").ok).toBe(false);
  });
  it("denies org admin without organisation", () => {
    expect(assertOrganisationAccess(orgAdminUnbound, "org-1").ok).toBe(false);
  });
  it("denies null target province for provincial", () => {
    expect(assertProvinceAccess(ncAdmin, null).ok).toBe(false);
  });
  it("denies null organisation for org admin", () => {
    expect(assertOrganisationAccess(orgAdmin, null).ok).toBe(false);
  });
});

describe("record-level location ownership", () => {
  const unassigned = {
    provinceId: "prov-nc",
    organisationId: null,
    ownerId: null,
  };
  const own = {
    provinceId: "prov-nc",
    organisationId: "org-1",
    ownerId: "u4",
  };
  const other = {
    provinceId: "prov-nc",
    organisationId: "org-1",
    ownerId: "u5",
  };

  it("blocks org admin editing unassigned records", () => {
    expect(assertLocationAccess(orgAdmin, unassigned, "write").ok).toBe(false);
  });
  it("blocks contributor editing another contributor record", () => {
    expect(assertLocationAccess(contributor, other, "write").ok).toBe(false);
  });
  it("allows contributor editing own record", () => {
    expect(assertLocationAccess(contributor, own, "write").ok).toBe(true);
  });
  it("blocks org claim of unassigned", () => {
    expect(
      assertLocationAssignmentChange(orgAdmin, unassigned, "org-1", "prov-nc").ok
    ).toBe(false);
  });
  it("enforces tenant where strictly", () => {
    expect(tenantWhere(orgAdminUnbound)).toEqual({ id: "__none__" });
    expect(tenantWhere(contributor)).toEqual({ ownerId: "u4" });
    expect(submissionTenantWhere(ncAdmin)).toEqual({ provinceId: "prov-nc" });
    expect(auditTenantWhere(ncAdmin)).toEqual({ provinceId: "prov-nc" });
  });
});

describe("role / publish gates", () => {
  it("disallows org/contributor publish", () => {
    expect(canPublish(orgAdmin)).toBe(false);
    expect(canVerify(contributor)).toBe(false);
    expect(assertStatusChange(orgAdmin, "PUBLISHED", "DRAFT").ok).toBe(false);
    expect(coerceCreateStatus(orgAdmin, "PUBLISHED")).toBe("DRAFT");
  });
  it("public statuses exclude drafts", () => {
    expect(PUBLIC_LOCATION_STATUSES).not.toContain("DRAFT");
    expect(PUBLIC_LOCATION_STATUSES).not.toContain("ARCHIVED");
  });
});

describe("XSS escaping", () => {
  it("escapes popup XSS", () => {
    const evil = `<img src=x onerror="alert(1)">`;
    expect(escapeHtml(evil)).toContain("&lt;img");
    expect(escapeAttr(`" onmouseover=alert(1)`)).toContain("&quot;");
  });
});

describe("rate limiting", () => {
  it("blocks after limit", () => {
    const key = `test-spam-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, { limit: 3, windowMs: 60_000 }).ok).toBe(true);
    }
    expect(rateLimit(key, { limit: 3, windowMs: 60_000 }).ok).toBe(false);
  });
});

describe("encrypted backups", () => {
  it("round-trips", () => {
    process.env.BACKUP_ENCRYPTION_KEY = "unit-test-backup-key-32chars!!";
    const payload = JSON.stringify({ hello: "world" });
    const enc = encryptBackupJson(payload);
    expect(decryptBackupBlob(enc)).toBe(payload);
  });
});

describe("upload magic bytes", () => {
  it("detects png", async () => {
    const { sniffMimeForTest } = await import("@/lib/storage");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffMimeForTest(png)).toBe("image/png");
  });
});

describe("publishing workflow", () => {
  it("contributor drafts; provincial publishes", () => {
    expect(coerceCreateStatus(contributor, "PUBLISHED")).toBe("DRAFT");
    expect(assertStatusChange(contributor, "VERIFIED", "DRAFT").ok).toBe(false);
    expect(assertStatusChange(ncAdmin, "PUBLISHED", "PENDING_REVIEW").ok).toBe(true);
  });
});

describe("super admin", () => {
  it("can access all provinces", () => {
    expect(assertProvinceAccess(superAdmin, "prov-gp").ok).toBe(true);
    expect(tenantWhere(superAdmin)).toEqual({});
  });
});
