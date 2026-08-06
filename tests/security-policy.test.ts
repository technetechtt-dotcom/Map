import { describe, expect, it } from "vitest";
import {
  assertOrganisationAccess,
  assertProvinceAccess,
  assertStatusChange,
  canPublish,
  canVerify,
  coerceCreateStatus,
  tenantWhere,
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
const orgAdmin = {
  id: "u3",
  role: "ORG_ADMIN",
  provinceId: "prov-nc",
  organisationId: "org-1",
};
const contributor = {
  id: "u4",
  role: "CONTRIBUTOR",
  provinceId: "prov-nc",
  organisationId: "org-1",
};

describe("role / tenant authorization", () => {
  it("allows only provincial+super to verify/publish", () => {
    expect(canVerify(superAdmin)).toBe(true);
    expect(canPublish(ncAdmin)).toBe(true);
    expect(canPublish(orgAdmin)).toBe(false);
    expect(canVerify(contributor)).toBe(false);
  });

  it("blocks org/contributor publish status transitions", () => {
    const blocked = assertStatusChange(orgAdmin, "PUBLISHED", "DRAFT");
    expect(blocked.ok).toBe(false);
    const ok = assertStatusChange(ncAdmin, "PUBLISHED", "DRAFT");
    expect(ok.ok).toBe(true);
  });

  it("scopes provincial admin by province", () => {
    expect(assertProvinceAccess(ncAdmin, "prov-nc").ok).toBe(true);
    expect(assertProvinceAccess(ncAdmin, "prov-gp").ok).toBe(false);
    expect(assertProvinceAccess(superAdmin, "prov-gp").ok).toBe(true);
  });

  it("scopes org admin by organisation", () => {
    expect(assertOrganisationAccess(orgAdmin, "org-1").ok).toBe(true);
    expect(assertOrganisationAccess(orgAdmin, "org-2").ok).toBe(false);
  });

  it("coerces create status for non-publishers", () => {
    expect(coerceCreateStatus(orgAdmin, "PUBLISHED")).toBe("DRAFT");
    expect(coerceCreateStatus(contributor, "PENDING_REVIEW")).toBe("PENDING_REVIEW");
    expect(coerceCreateStatus(ncAdmin, "PUBLISHED")).toBe("PUBLISHED");
  });

  it("builds tenant where fragments", () => {
    expect(tenantWhere(superAdmin)).toEqual({});
    expect(tenantWhere(ncAdmin)).toEqual({ provinceId: "prov-nc" });
    expect(tenantWhere(orgAdmin)).toEqual({ organisationId: "org-1" });
    expect(tenantWhere(contributor)).toMatchObject({
      OR: expect.arrayContaining([{ ownerId: "u4" }]),
    });
  });
});

describe("XSS escaping (Leaflet popups)", () => {
  it("escapes HTML entities in popup content", () => {
    const evil = `<img src=x onerror="alert(1)">`;
    const out = escapeHtml(evil);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
    expect(escapeAttr(`" onmouseover=alert(1)`)).toContain("&quot;");
  });
});

describe("rate limiting / submission spam", () => {
  it("blocks after limit", () => {
    const key = `test-spam-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, { limit: 3, windowMs: 60_000 }).ok).toBe(true);
    }
    const blocked = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
  });
});

describe("encrypted backups", () => {
  it("round-trips AES-GCM backup blobs", () => {
    process.env.BACKUP_ENCRYPTION_KEY = "unit-test-backup-key-32chars!!";
    const payload = JSON.stringify({ hello: "world", n: 1 });
    const enc = encryptBackupJson(payload);
    expect(enc.subarray(0, 5).toString()).toBe("ICTB1");
    expect(decryptBackupBlob(enc)).toBe(payload);
  });
});

describe("upload content validation helpers", () => {
  it("detects png magic bytes shape", async () => {
    const { sniffMimeForTest } = await import("@/lib/storage");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffMimeForTest(png)).toBe("image/png");
    expect(sniffMimeForTest(Buffer.from("not-an-image"))).toBe(null);
  });
});

describe("publishing workflow policy chain", () => {
  it("end-to-end: contributor drafts; provincial publishes", () => {
    const draftStatus = coerceCreateStatus(contributor, "PUBLISHED");
    expect(draftStatus).toBe("DRAFT");
    const attempt = assertStatusChange(contributor, "VERIFIED", draftStatus);
    expect(attempt.ok).toBe(false);
    const approved = assertStatusChange(ncAdmin, "PUBLISHED", "PENDING_REVIEW");
    expect(approved.ok).toBe(true);
  });
});
