import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertStatusChange,
  assertPublishableQuality,
  ROLES,
} from "@/lib/policy";

describe("Record Lifecycle & Status State Machine", () => {
  const superAdmin = { id: "usr-super", role: ROLES.SUPER_ADMIN };
  const provincialAdmin = { id: "usr-nc", role: ROLES.PROVINCIAL_ADMIN, provinceId: "prov-nc" };
  const orgAdmin = { id: "usr-org", role: ROLES.ORG_ADMIN, organisationId: "org-1", provinceId: "prov-nc" };
  const contributor = { id: "usr-contrib", role: ROLES.CONTRIBUTOR, organisationId: "org-1", provinceId: "prov-nc" };

  describe("Non-elevated roles (Contributor, Org Admin)", () => {
    it("allows submitting draft for review (DRAFT -> PENDING_REVIEW)", () => {
      expect(assertStatusChange(contributor, "PENDING_REVIEW", "DRAFT").ok).toBe(true);
      expect(assertStatusChange(orgAdmin, "PENDING_REVIEW", "DRAFT").ok).toBe(true);
    });

    it("blocks contributors from directly publishing or verifying", () => {
      expect(assertStatusChange(contributor, "PUBLISHED", "DRAFT").ok).toBe(false);
      expect(assertStatusChange(contributor, "VERIFIED", "DRAFT").ok).toBe(false);
      expect(assertStatusChange(orgAdmin, "PUBLISHED", "DRAFT").ok).toBe(false);
      expect(assertStatusChange(orgAdmin, "VERIFIED", "DRAFT").ok).toBe(false);
    });

    it("blocks contributors from unauthorized backward transitions", () => {
      // Once submitted, non-admins cannot pull it back without reviewer rejection
      expect(assertStatusChange(contributor, "DRAFT", "PENDING_REVIEW").ok).toBe(false);
      expect(assertStatusChange(orgAdmin, "DRAFT", "PENDING_REVIEW").ok).toBe(false);
    });

    it("blocks contributors from archiving records", () => {
      expect(assertStatusChange(contributor, "ARCHIVED", "PUBLISHED").ok).toBe(false);
      expect(assertStatusChange(orgAdmin, "ARCHIVED", "VERIFIED").ok).toBe(false);
    });
  });

  describe("Elevated roles (Provincial Admin, Super Admin)", () => {
    it("allows standard lifecycle progression", () => {
      // DRAFT -> PENDING_REVIEW
      expect(assertStatusChange(provincialAdmin, "PENDING_REVIEW", "DRAFT").ok).toBe(true);
      // PENDING_REVIEW -> VERIFIED
      expect(assertStatusChange(provincialAdmin, "VERIFIED", "PENDING_REVIEW").ok).toBe(true);
      // VERIFIED -> PUBLISHED
      expect(assertStatusChange(provincialAdmin, "PUBLISHED", "VERIFIED").ok).toBe(true);
      // PUBLISHED -> ARCHIVED
      expect(assertStatusChange(provincialAdmin, "ARCHIVED", "PUBLISHED").ok).toBe(true);
    });

    it("allows rejection / rework transitions", () => {
      // Reviewer sends back pending review to draft for rework
      expect(assertStatusChange(provincialAdmin, "DRAFT", "PENDING_REVIEW").ok).toBe(true);
      // Reviewer reopens verified record back to draft
      expect(assertStatusChange(provincialAdmin, "DRAFT", "VERIFIED").ok).toBe(true);
    });

    it("allows unpublishing / taking down records", () => {
      // Unpublish to verified or pending review
      expect(assertStatusChange(provincialAdmin, "VERIFIED", "PUBLISHED").ok).toBe(true);
      expect(assertStatusChange(provincialAdmin, "PENDING_REVIEW", "PUBLISHED").ok).toBe(true);
    });

    it("allows restoring archived records to draft", () => {
      expect(assertStatusChange(provincialAdmin, "DRAFT", "ARCHIVED").ok).toBe(true);
      expect(assertStatusChange(superAdmin, "DRAFT", "ARCHIVED").ok).toBe(true);
    });

    it("blocks invalid transitions (e.g. ARCHIVED directly to PUBLISHED)", () => {
      expect(assertStatusChange(provincialAdmin, "PUBLISHED", "ARCHIVED").ok).toBe(false);
      expect(assertStatusChange(superAdmin, "PUBLISHED", "ARCHIVED").ok).toBe(false);
    });
  });

  describe("Mandatory review gate", () => {
    const originalEnv = process.env.REQUIRE_REVIEW_BEFORE_PUBLISH;

    afterEach(() => {
      process.env.REQUIRE_REVIEW_BEFORE_PUBLISH = originalEnv;
    });

    it("blocks direct DRAFT -> PUBLISHED when REQUIRE_REVIEW_BEFORE_PUBLISH=1", () => {
      process.env.REQUIRE_REVIEW_BEFORE_PUBLISH = "1";
      const result = assertStatusChange(provincialAdmin, "PUBLISHED", "DRAFT");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/mandatory review/i);
      }
    });

    it("allows direct DRAFT -> PUBLISHED when REQUIRE_REVIEW_BEFORE_PUBLISH is not set", () => {
      delete process.env.REQUIRE_REVIEW_BEFORE_PUBLISH;
      const result = assertStatusChange(provincialAdmin, "PUBLISHED", "DRAFT");
      expect(result.ok).toBe(true);
    });
  });

  describe("Coordinate quality publication gate", () => {
    const originalQualityEnv = process.env.ENFORCE_COORD_QUALITY;

    beforeEach(() => {
      process.env.ENFORCE_COORD_QUALITY = "1";
    });

    afterEach(() => {
      process.env.ENFORCE_COORD_QUALITY = originalQualityEnv;
    });

    it("allows publication with verified coordinates", () => {
      expect(assertPublishableQuality("verified").ok).toBe(true);
    });

    it("allows publication with estimated coordinates", () => {
      expect(assertPublishableQuality("estimated").ok).toBe(true);
    });

    it("blocks publication with unknown or town-centre coordinates", () => {
      expect(assertPublishableQuality("unknown").ok).toBe(false);
      expect(assertPublishableQuality("town-centre").ok).toBe(false);
      expect(assertPublishableQuality(null).ok).toBe(false);
    });
  });
});
