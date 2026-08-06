/**
 * Offline smoke test for encrypted backup round-trip (no DB required for crypto).
 */
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require("crypto");

function keyMaterial(raw) {
  if (!raw || raw.length < 16) throw new Error("key");
  return createHash("sha256").update(raw).digest();
}

function encrypt(plaintext, keyRaw) {
  const key = keyMaterial(keyRaw);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from("ICTB1"), iv, tag, enc]);
}

function decrypt(buf, keyRaw) {
  const key = keyMaterial(keyRaw);
  const iv = buf.subarray(5, 17);
  const tag = buf.subarray(17, 33);
  const data = buf.subarray(33);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const key = process.env.BACKUP_ENCRYPTION_KEY || "ci-backup-encryption-key-min-16";
const sample = JSON.stringify({ hello: "restore-smoke", tables: ["Location", "User"] });
const enc = encrypt(sample, key);
const out = decrypt(enc, key);
if (out !== sample) {
  console.error("Restore smoke failed");
  process.exit(1);
}
console.log("Backup encrypt/decrypt smoke OK");
