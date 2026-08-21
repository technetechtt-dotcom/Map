/** AES-256-GCM envelope for versioned MFA secrets at rest. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { unwrapMfaDataKey } from "./kms";

const PREFIX = "MFA2";
const primedKeys = new Map<number, Buffer>();

export function currentMfaKeyVersion(): number {
  const value = Number(process.env.MFA_KEY_VERSION || 1);
  if (!Number.isInteger(value) || value < 1) throw new Error("MFA_KEY_VERSION must be a positive integer");
  return value;
}

export async function primeMfaDataKey(version = currentMfaKeyVersion()): Promise<Buffer> {
  const key = await unwrapMfaDataKey(version);
  primedKeys.set(version, key);
  return key;
}

function keyMaterial(version: number): string {
  const current = currentMfaKeyVersion();
  const previous = Number(process.env.MFA_PREVIOUS_KEY_VERSION || 0);
  const raw =
    process.env[`MFA_ENCRYPTION_KEY_V${version}`] ||
    (version === current ? process.env.MFA_ENCRYPTION_KEY : undefined) ||
    (version === previous ? process.env.MFA_ENCRYPTION_KEY_PREVIOUS : undefined) ||
    "";
  if (!raw || raw.length < 32) {
    throw new Error(`Dedicated MFA encryption key version ${version} is unavailable or too short`);
  }
  return raw;
}

function dataKey(version: number): Buffer {
  const primed = primedKeys.get(version);
  if (primed) return primed;
  return createHash("sha256").update(keyMaterial(version)).digest();
}

export function encryptSecret(plaintext: string, version = currentMfaKeyVersion()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(version), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${version}:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

function decryptParts(parts: string[], version: number, offset: number): string {
  const iv = Buffer.from(parts[offset], "base64url");
  const tag = Buffer.from(parts[offset + 1], "base64url");
  const data = Buffer.from(parts[offset + 2], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(version), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function decryptSecret(stored: string, persistedVersion?: number): string {
  if (!stored) return "";
  if (stored.startsWith(`${PREFIX}:`)) {
    const parts = stored.split(":");
    if (parts.length !== 5) throw new Error("Corrupt MFA secret");
    const version = Number(parts[1]);
    if (!Number.isInteger(version) || version < 1) throw new Error("Invalid MFA key version");
    if (persistedVersion && persistedVersion !== version) throw new Error("MFA key version mismatch");
    return decryptParts(parts, version, 2);
  }

  // MFA1 ciphertext did not embed its version. It is supported only during a
  // controlled rotation, using the database mfaKeyVersion/current/previous key.
  if (stored.startsWith("MFA1:")) {
    const parts = stored.split(":");
    if (parts.length !== 4) throw new Error("Corrupt legacy MFA ciphertext");
    const versions = [persistedVersion, currentMfaKeyVersion(), Number(process.env.MFA_PREVIOUS_KEY_VERSION || 0)]
      .filter((value, index, all): value is number => Boolean(value) && all.indexOf(value) === index);
    for (const version of versions) {
      try {
        return decryptParts(parts, version, 1);
      } catch {
        // Try the next explicitly configured rotation key.
      }
    }
    throw new Error("Legacy MFA ciphertext could not be decrypted with configured keys");
  }

  throw new Error("Plaintext MFA secrets are not supported");
}

export function isEncryptedSecret(stored: string | null | undefined): boolean {
  return Boolean(stored && (stored.startsWith(`${PREFIX}:`) || stored.startsWith("MFA1:")));
}

export function rotateSecret(stored: string, persistedVersion?: number): string {
  return encryptSecret(decryptSecret(stored, persistedVersion));
}
