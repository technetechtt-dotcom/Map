import { describe, expect, it } from "vitest";
import { validatePasswordShape, wasPasswordReused } from "@/lib/password";
import bcrypt from "bcryptjs";

describe("password policy", () => {
  it("rejects short passwords", () => {
    expect(validatePasswordShape("Short1").ok).toBe(false);
  });

  it("requires mixed case and digit", () => {
    expect(validatePasswordShape("alllowercase1x").ok).toBe(false);
    expect(validatePasswordShape("ALLUPPERCASE1X").ok).toBe(false);
    expect(validatePasswordShape("NoDigitsHere!!").ok).toBe(false);
  });

  it("accepts a strong password", () => {
    expect(validatePasswordShape("CorrectHorse9x").ok).toBe(true);
  });

  it("detects reused hashes", async () => {
    const hash = await bcrypt.hash("CorrectHorse9x", 8);
    expect(await wasPasswordReused("CorrectHorse9x", [hash])).toBe(true);
    expect(await wasPasswordReused("DifferentHorse9x", [hash])).toBe(false);
  });
});
