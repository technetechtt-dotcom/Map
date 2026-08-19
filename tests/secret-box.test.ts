import { describe, expect, it, beforeAll } from "vitest";
import { decryptSecret, encryptSecret, isEncryptedSecret, rotateSecret } from "@/lib/secret-box";
import { wrapLocalDataKey, unwrapLocalDataKey } from "@/lib/kms";

beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = "unit-test-mfa-key-that-is-32-characters+";
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

  it("rejects legacy plaintext", () => {
    expect(() => decryptSecret("legacy-plain")).toThrow(/Plaintext/);
  });

  it("decrypts with the previous version during rotation", () => {
    process.env.MFA_KEY_VERSION = "1";
    const stored = encryptSecret("rotate-me");
    process.env.MFA_KEY_VERSION = "2";
    process.env.MFA_ENCRYPTION_KEY = "new-unit-test-mfa-key-that-is-32-characters+";
    process.env.MFA_PREVIOUS_KEY_VERSION = "1";
    process.env.MFA_ENCRYPTION_KEY_PREVIOUS = "unit-test-mfa-key-that-is-32-characters+";
    expect(decryptSecret(stored, 1)).toBe("rotate-me");
    delete process.env.MFA_KEY_VERSION;
    delete process.env.MFA_PREVIOUS_KEY_VERSION;
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    process.env.MFA_ENCRYPTION_KEY = "unit-test-mfa-key-that-is-32-characters+";
  });
});

describe("KMS local wrapping", () => {
  it("wraps and unwraps a data key", () => {
    const key = Buffer.from("0123456789abcdef0123456789abcdef");
    const wrapped = wrapLocalDataKey(key, "wrapping-secret-that-is-long-enough");
    expect(unwrapLocalDataKey(wrapped, "wrapping-secret-that-is-long-enough").equals(key)).toBe(true);
  });
});
