/** Optional AWS KMS wrapping for MFA data keys. Env secrets remain the local/dev fallback. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export async function unwrapMfaDataKey(version: number): Promise<Buffer> {
  const kmsKeyId = process.env.AWS_KMS_KEY_ID;
  const wrapped = process.env[`MFA_KMS_CIPHERTEXT_V${version}`] || process.env.MFA_KMS_CIPHERTEXT;
  if (kmsKeyId && wrapped) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const importKms = new Function("return import('@aws-sdk/client-kms')") as () => Promise<{
        KMSClient: new (cfg: unknown) => { send: (command: unknown) => Promise<{ Plaintext?: Uint8Array }> };
        DecryptCommand: new (input: unknown) => unknown;
      }>;
      const sdk = await importKms();
      const client = new sdk.KMSClient({ region: process.env.AWS_REGION || process.env.S3_REGION || "af-south-1" });
      const result = await client.send(
        new sdk.DecryptCommand({
          CiphertextBlob: Buffer.from(wrapped, "base64"),
          KeyId: kmsKeyId,
          EncryptionContext: { purpose: "mfa", version: String(version) },
        })
      );
      if (result.Plaintext) return Buffer.from(result.Plaintext).subarray(0, 32);
    } catch {
      // Fall through to env material so rotation failure can be recovered.
    }
  }
  const raw =
    process.env[`MFA_ENCRYPTION_KEY_V${version}`] ||
    (version === Number(process.env.MFA_KEY_VERSION || 1) ? process.env.MFA_ENCRYPTION_KEY : undefined) ||
    (version === Number(process.env.MFA_PREVIOUS_KEY_VERSION || 0) ? process.env.MFA_ENCRYPTION_KEY_PREVIOUS : undefined) ||
    "";
  if (!raw || raw.length < 32) throw new Error(`Dedicated MFA encryption key version ${version} is unavailable or too short`);
  return createHash("sha256").update(raw).digest();
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
