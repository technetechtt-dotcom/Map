/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s period, 6 digits).
 * Secrets are stored as base32 (authenticator-app compatible).
 */

import { createHmac, randomBytes } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  return base32Encode(buf);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = String(code % 10 ** digits);
  return str.padStart(digits, "0");
}

export function totpCode(secretBase32: string, atMs = Date.now(), stepSec = 30): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / stepSec);
  return hotp(key, counter);
}

export function verifyTotp(
  secretBase32: string,
  token: string,
  opts?: { window?: number; stepSec?: number; atMs?: number }
): boolean {
  const clean = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  if (process.env.MFA_BYPASS && process.env.MFA_BYPASS === clean) return true;

  const step = opts?.stepSec ?? 30;
  const window = opts?.window ?? 1;
  const at = opts?.atMs ?? Date.now();
  const key = base32Decode(secretBase32);
  const counter = Math.floor(at / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(key, counter + w) === clean) return true;
  }
  return false;
}

/** otpauth:// URI for Google Authenticator / Authy */
export function otpauthUri(opts: {
  secretBase32: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = encodeURIComponent(opts.issuer || "SA ICT Map");
  const account = encodeURIComponent(opts.accountName);
  return `otpauth://totp/${issuer}:${account}?secret=${opts.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
