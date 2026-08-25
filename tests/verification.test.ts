import { describe, expect, it } from "vitest";
import {
  defaultVerificationExpiresAt,
  deriveVerificationTier,
  isVerificationCurrent,
  organisationVerificationStamp,
  verificationActionData,
  verificationFilterWhere,
} from "@/lib/verification";

describe("verification tiers", () => {
  it("keeps an explicit tier", () => {
    expect(deriveVerificationTier({ verificationTier: "field" })).toBe("field");
    expect(deriveVerificationTier({ verificationTier: "desktop" })).toBe("desktop");
    expect(deriveVerificationTier({ lastVerifiedAt: "2026-08-21" })).toBe("desktop");
    expect(deriveVerificationTier({ sourceConfidence: "public-directory" })).toBe("directory");
    expect(deriveVerificationTier({})).toBe("unverified");
  });

  it("treats missing expiry as stale and expired dates as stale", () => {
    expect(isVerificationCurrent(null)).toBe(false);
    expect(isVerificationCurrent("2099-01-01", new Date("2026-08-24"))).toBe(true);
    expect(isVerificationCurrent("2020-01-01", new Date("2026-08-24"))).toBe(false);
  });

  it("defaults verify actions to desktop with a TTL expiry", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    expect(verificationActionData({ status: "VERIFIED", now })).toMatchObject({
      lastVerifiedAt: now,
      verificationTier: "desktop",
      verificationExpiresAt: defaultVerificationExpiresAt(now),
    });
    expect(organisationVerificationStamp({ tier: "field", now })).toMatchObject({
      verified: true,
      verificationTier: "field",
      lastVerifiedAt: now,
    });
  });

  it("maps verified=1 to current desktop+field and excludes expired rows", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    expect(verificationFilterWhere("current", now)).toEqual({
      lastVerifiedAt: { not: null },
      verificationTier: { in: ["desktop", "field"] },
      verificationExpiresAt: { gt: now },
    });
    expect(verificationFilterWhere("1", now)).toEqual(verificationFilterWhere("current", now));
    expect(verificationFilterWhere("expired", now)).toMatchObject({
      lastVerifiedAt: { not: null },
      verificationExpiresAt: { lte: now },
    });
    expect(verificationFilterWhere("all")).toEqual({});
  });
});
