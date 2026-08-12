import { describe, expect, it, afterEach } from "vitest";
import { clientIpFromHeaders } from "@/lib/security";
import {
  assertLocationAccess,
  assertStatusChange,
  canPublish,
  canVerify,
  coerceCreateStatus,
} from "@/lib/policy";

describe("trusted proxy IP", () => {
  const saved = process.env.TRUST_PROXY;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = saved;
  });

  it("ignores X-Forwarded-For unless TRUST_PROXY=1", () => {
    process.env.TRUST_PROXY = "0";
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });

  it("uses first forwarded hop when TRUST_PROXY=1", () => {
    process.env.TRUST_PROXY = "1";
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("rejects garbage forwarding headers", () => {
    process.env.TRUST_PROXY = "1";
    const headers = new Headers({ "x-forwarded-for": "not-an-ip<script>" });
    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });
});

describe("RBAC matrix", () => {
  const superAdmin = { id: "s", role: "SUPER_ADMIN", provinceId: null, organisationId: null };
  const prov = { id: "p", role: "PROVINCIAL_ADMIN", provinceId: "nc", organisationId: null };
  const org = { id: "o", role: "ORG_ADMIN", provinceId: "nc", organisationId: "org1" };
  const contrib = { id: "c", role: "CONTRIBUTOR", provinceId: "nc", organisationId: "org1" };
  const otherProv = { id: "p2", role: "PROVINCIAL_ADMIN", provinceId: "gp", organisationId: null };

  it("blocks cross-province provincial admin", () => {
    expect(assertLocationAccess(otherProv, { provinceId: "nc", organisationId: null }).ok).toBe(
      false
    );
  });

  it("blocks org admin from another org", () => {
    expect(
      assertLocationAccess(org, { provinceId: "nc", organisationId: "org2", ownerId: "x" }).ok
    ).toBe(false);
  });

  it("blocks contributor publish/verify", () => {
    expect(canPublish(contrib)).toBe(false);
    expect(canVerify(contrib)).toBe(false);
    expect(assertStatusChange(contrib, "PUBLISHED").ok).toBe(false);
    expect(coerceCreateStatus(contrib, "PUBLISHED")).toBe("DRAFT");
  });

  it("blocks org admin verification", () => {
    expect(canVerify(org)).toBe(false);
    expect(assertStatusChange(org, "VERIFIED").ok).toBe(false);
  });

  it("allows super admin everywhere", () => {
    expect(assertLocationAccess(superAdmin, { provinceId: "nc", organisationId: "org1" }).ok).toBe(
      true
    );
    expect(canPublish(superAdmin)).toBe(true);
    expect(canVerify(prov)).toBe(true);
  });
});
