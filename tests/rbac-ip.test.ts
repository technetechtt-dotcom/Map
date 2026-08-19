import { describe, expect, it, afterEach } from "vitest";
import { clientIpFromHeaders, ipInCidr, normalizeIp } from "@/lib/security";
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
    delete process.env.TRUST_PROXY_HEADER_SECRET;
    delete process.env.TRUST_PROXY_HOPS;
  });

  it("ignores X-Forwarded-For unless TRUST_PROXY=1", () => {
    process.env.TRUST_PROXY = "0";
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });

  it("uses the hop before the trusted proxy", () => {
    process.env.TRUST_PROXY = "1";
    process.env.TRUST_PROXY_HOPS = "2";
    process.env.TRUST_PROXY_HEADER_SECRET = "ingress-secret";
    const headers = new Headers({
      // Immediate ingress is authenticated by the secret and is not itself
      // part of XFF; the remaining trusted proxy is the right-most entry.
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "x-trusted-proxy-secret": "ingress-secret",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("rejects forged forwarding headers from an unapproved peer", () => {
    process.env.TRUST_PROXY = "1";
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    expect(clientIpFromHeaders(headers, { remoteAddress: "198.51.100.5" })).toBe("unknown");
  });

  it("supports Cloudflare/load-balancer CIDRs and IPv6", () => {
    process.env.TRUST_PROXY = "1";
    process.env.TRUST_PROXY_HOPS = "1";
    process.env.TRUST_PROXY_CIDRS = "173.245.48.0/20,2400:cb00::/32";
    const headers = new Headers({ "x-forwarded-for": "2001:db8::1234" });
    expect(clientIpFromHeaders(headers, { remoteAddress: "2400:cb00:12::1" })).toBe("2001:db8::1234");
    delete process.env.TRUST_PROXY_CIDRS;
  });

  it("rejects garbage forwarding headers", () => {
    process.env.TRUST_PROXY = "1";
    process.env.TRUST_PROXY_HEADER_SECRET = "ingress-secret";
    const headers = new Headers({ "x-forwarded-for": "not-an-ip<script>", "x-trusted-proxy-secret": "ingress-secret" });
    expect(clientIpFromHeaders(headers)).toBe("unknown");
  });

  it("validates IPv4 octets and CIDR membership", () => {
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(ipInCidr("10.2.3.4", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("11.2.3.4", "10.0.0.0/8")).toBe(false);
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

  it("keeps contributor drafts private from other contributors in the same org", () => {
    expect(
      assertLocationAccess(contrib, {
        provinceId: "nc",
        organisationId: "org1",
        ownerId: "another-contributor",
        status: "DRAFT",
      }, "read").ok
    ).toBe(false);
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
