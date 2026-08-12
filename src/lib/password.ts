/**
 * Password policy: length, complexity, reuse, optional HIBP k-anonymity check.
 */

import { createHash } from "crypto";
import bcrypt from "bcryptjs";

const MIN_LEN = 12;
const HISTORY = 5;

export type PasswordCheck =
  | { ok: true }
  | { ok: false; error: string };

export function validatePasswordShape(password: string): PasswordCheck {
  if (!password || password.length < MIN_LEN) {
    return { ok: false, error: `Password must be at least ${MIN_LEN} characters` };
  }
  if (password.length > 128) return { ok: false, error: "Password too long" };
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, error: "Password must include upper, lower, and a digit" };
  }
  const weak = ["password", "Password1", "Admin123456", "Welcome1234", "changeme1234"];
  if (weak.some((w) => password.toLowerCase().includes(w.toLowerCase()))) {
    return { ok: false, error: "Password is too common" };
  }
  return { ok: true };
}

/** Have I Been Pwned range API (k-anonymity — only SHA1 prefix is sent). */
export async function isPwnedPassword(password: string): Promise<boolean> {
  if (process.env.HIBP_DISABLED === "1" || process.env.NODE_ENV === "test") return false;
  try {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "sa-ict-ecosystem-map" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split("\n").some((line) => line.split(":")[0]?.trim() === suffix);
  } catch {
    return false;
  }
}

export async function assertStrongPassword(password: string): Promise<PasswordCheck> {
  const shape = validatePasswordShape(password);
  if (!shape.ok) return shape;
  if (await isPwnedPassword(password)) {
    return { ok: false, error: "This password appears in a known breach — choose another" };
  }
  return { ok: true };
}

export async function wasPasswordReused(
  password: string,
  hashes: string[]
): Promise<boolean> {
  for (const h of hashes.slice(0, HISTORY)) {
    if (h && (await bcrypt.compare(password, h))) return true;
  }
  return false;
}

export const PASSWORD_HISTORY_KEEP = HISTORY;
