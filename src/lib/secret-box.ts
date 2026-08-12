/**
 * AES-256-GCM envelope for MFA secrets at rest.
 * Production: set MFA_ENCRYPTION_KEY (32+ chars) sourced from KMS/Key Vault.
 * Optional envelope: KMS_DATA_KEY is the wrapped DEK; MFA_ENCRYPTION_KEY is the local DEK.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "MFA1";

function dataKey(): Buffer {
  const raw =
    process.env.MFA_ENCRYPTION_KEY ||
    process.env.KMS_DATA_KEY ||
    process.env.BACKUP_ENCRYPTION_KEY ||
    "";
  if (!raw || raw.length < 16) {
    throw new Error("MFA_ENCRYPTION_KEY (or BACKUP_ENCRYPTION_KEY) required to protect MFA secrets");
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = dataKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(`${PREFIX}:`)) {
    // Legacy plaintext (pre-encryption) — caller should re-encrypt
    return stored;
  }
  const parts = stored.split(":");
  if (parts.length !== 4) throw new Error("Corrupt MFA secret");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(stored: string | null | undefined): boolean {
  return Boolean(stored && stored.startsWith(`${PREFIX}:`));
}

/** Re-encrypt with current key (rotation). */
export function rotateSecret(stored: string): string {
  return encryptSecret(decryptSecret(stored));
}
