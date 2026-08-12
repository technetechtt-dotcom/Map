import { describe, expect, it, beforeAll } from "vitest";
import { decryptSecret, encryptSecret, isEncryptedSecret, rotateSecret } from "@/lib/secret-box";

beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = "unit-test-mfa-key-16+";
});

describe("MFA secret box", () => {
  it("encrypts and decrypts", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const stored = encryptSecret(secret);
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it("rotates ciphertext", () => {
    const stored = encryptSecret("abc123secret");
    const rotated = rotateSecret(stored);
    expect(rotated).not.toBe(stored);
    expect(decryptSecret(rotated)).toBe("abc123secret");
  });

  it("reads legacy plaintext", () => {
    expect(decryptSecret("legacy-plain")).toBe("legacy-plain");
  });
});
