/**
 * Encrypted backup envelope (AES-256-GCM).
 * BACKUP_ENCRYPTION_KEY must be 32+ byte secret (hex or utf8).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function keyMaterial(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (!raw || raw.length < 16) {
    throw new Error("BACKUP_ENCRYPTION_KEY is required for backups (min 16 chars)");
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptBackupJson(plaintext: string): Buffer {
  const key = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: magic | iv(12) | tag(16) | ciphertext
  return Buffer.concat([Buffer.from("ICTB1"), iv, tag, enc]);
}

export function decryptBackupBlob(buf: Buffer): string {
  if (buf.length < 5 + 12 + 16) throw new Error("Invalid backup blob");
  const magic = buf.subarray(0, 5).toString("utf8");
  if (magic !== "ICTB1") throw new Error("Not an encrypted ICT backup");
  const key = keyMaterial();
  const iv = buf.subarray(5, 17);
  const tag = buf.subarray(17, 33);
  const data = buf.subarray(33);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
