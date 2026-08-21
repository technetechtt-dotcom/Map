/** Optional AWS KMS wrapping for MFA data keys. Env secrets remain the local/dev fallback. */
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type CachedKey = { key: Buffer; expiresAt: number };
const processCache = new Map<number, CachedKey>();
const DATA_KEY_TTL_MS = Number(process.env.MFA_DATA_KEY_TTL_MS || 15 * 60_000);

function wipe(entry: CachedKey) {
  entry.key.fill(0);
}

export function clearMfaDataKeyCache() {
  for (const entry of processCache.values()) wipe(entry);
  processCache.clear();
}

function cachedDataKey(version: number): Buffer | null {
  const hit = processCache.get(version);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    wipe(hit);
    processCache.delete(version);
    return null;
  }
  return hit.key;
}

function rememberDataKey(version: number, key: Buffer) {
  const existing = processCache.get(version);
  if (existing) wipe(existing);
  processCache.set(version, { key, expiresAt: Date.now() + Math.max(60_000, DATA_KEY_TTL_MS) });
}

export async function unwrapMfaDataKey(version: number): Promise<Buffer> {
  const cached = cachedDataKey(version);
  if (cached) return cached;

  const kmsKeyId = process.env.AWS_KMS_KEY_ID;
  const wrapped = process.env[`MFA_KMS_CIPHERTEXT_V${version}`] || process.env.MFA_KMS_CIPHERTEXT;
  if (kmsKeyId && wrapped) {
    const client = new KMSClient({ region: process.env.AWS_REGION || process.env.S3_REGION || "af-south-1" });
    const result = await client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(wrapped, "base64"),
        KeyId: kmsKeyId,
        EncryptionContext: { purpose: "mfa", version: String(version) },
      })
    );
    if (!result.Plaintext) throw new Error("KMS decrypt returned empty plaintext");
    const key = Buffer.from(result.Plaintext).subarray(0, 32);
    rememberDataKey(version, key);
    return key;
  }
  const raw =
    process.env[`MFA_ENCRYPTION_KEY_V${version}`] ||
    (version === Number(process.env.MFA_KEY_VERSION || 1) ? process.env.MFA_ENCRYPTION_KEY : undefined) ||
    (version === Number(process.env.MFA_PREVIOUS_KEY_VERSION || 0) ? process.env.MFA_ENCRYPTION_KEY_PREVIOUS : undefined) ||
    "";
  if (!raw || raw.length < 32) throw new Error(`Dedicated MFA encryption key version ${version} is unavailable or too short`);
  const key = createHash("sha256").update(raw).digest();
  rememberDataKey(version, key);
  return key;
}

export function wrapLocalDataKey(plaintext: Buffer, wrappingKey: string): string {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(wrappingKey).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function unwrapLocalDataKey(stored: string, wrappingKey: string): Buffer {
  const [iv, tag, data] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(wrappingKey).digest(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
}
