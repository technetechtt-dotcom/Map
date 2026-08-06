import { describe, expect, it } from "vitest";
import {
  generateTotpSecret,
  totpCode,
  verifyTotp,
  base32Encode,
  base32Decode,
  otpauthUri,
} from "@/lib/totp";
import {
  normalizeName,
  nameSimilarity,
  findDuplicateCandidates,
  distanceMetres,
  findNearbyLocations,
} from "@/lib/duplicates";
import { PUBLIC_LOCATION_STATUSES } from "@/lib/policy";

describe("RFC 6238 TOTP", () => {
  it("round-trips base32", () => {
    const raw = Buffer.from("HelloWorldSecret!!");
    expect(base32Decode(base32Encode(raw)).toString("utf8")).toBe(raw.toString("utf8"));
  });

  it("generates and verifies codes within window", () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("otpauth URI is well-formed", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = otpauthUri({ secretBase32: secret, accountName: "admin@example.com" });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
  });
});

describe("duplicate matching", () => {
  it("normalizes names", () => {
    expect(normalizeName("  Sol  Plaatje  Uni ")).toBe("sol plaatje uni");
  });

  it("scores similar names high", () => {
    expect(nameSimilarity("Kimberley Digital Hub", "Kimberley Digital Hub")).toBe(1);
    expect(nameSimilarity("NC Innovation Hub", "NC Innovation Hub Centre")).toBeGreaterThan(0.4);
  });

  it("finds duplicate candidates same province", () => {
    const hits = findDuplicateCandidates(
      { name: "NC Innovation Hub", provinceId: "nc" },
      [
        { id: "1", name: "NC Innovation Hub", provinceId: "nc" },
        { id: "2", name: "NC Innovation Hub", provinceId: "gp" },
        { id: "3", name: "Completely Different", provinceId: "nc" },
      ]
    );
    expect(hits[0]?.id).toBe("1");
    expect(hits.some((h) => h.id === "2")).toBe(false);
  });

  it("measures nearby metres", () => {
    // ~111m per 0.001 deg lat
    const d = distanceMetres(-28.7, 24.7, -28.701, 24.7);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(150);
    const near = findNearbyLocations(
      { latitude: -28.7, longitude: 24.7 },
      [
        { id: "a", name: "A", latitude: -28.7005, longitude: 24.7 },
        { id: "b", name: "B", latitude: -29.5, longitude: 25.0 },
      ],
      200
    );
    expect(near.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("public surface policy", () => {
  it("only published and verified are public statuses", () => {
    expect(PUBLIC_LOCATION_STATUSES).toEqual(["PUBLISHED", "VERIFIED"]);
    expect(PUBLIC_LOCATION_STATUSES).not.toContain("DRAFT");
  });
});
