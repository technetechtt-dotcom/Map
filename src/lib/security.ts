/**
 * Client IP helper — never trusts forwarding headers unless TRUST_PROXY=1.
 */

import { createHash, timingSafeEqual } from "crypto";
import { isIP } from "net";
// Re-export for existing server-side callers and backwards compatibility.
export { escapeAttr, escapeHtml } from "./escape";

export const MAX_JSON_BYTES = 128 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function readJsonLimited<T = unknown>(
  req: Request,
  maxBytes = MAX_JSON_BYTES
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) {
    return { ok: false, error: `Payload too large (max ${maxBytes} bytes)` };
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    return { ok: false, error: `Payload too large (max ${maxBytes} bytes)` };
  }
  if (buf.byteLength === 0) return { ok: true, data: {} as T };
  try {
    return { ok: true, data: JSON.parse(buf.toString("utf8")) as T };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

export async function verifyCaptcha(input: {
  token?: string | null;
  honeypot?: string | null;
  remoteIp?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.honeypot) {
    return { ok: false, error: "Rejected" };
  }

  const disabled =
    process.env.CAPTCHA_DISABLED === "1" ||
    (process.env.NODE_ENV !== "production" &&
      !process.env.TURNSTILE_SECRET &&
      !process.env.RECAPTCHA_SECRET);

  if (disabled) return { ok: true };

  const turnstile = process.env.TURNSTILE_SECRET;
  const recaptcha = process.env.RECAPTCHA_SECRET;
  const token = (input.token || "").trim();
  if (!token) return { ok: false, error: "CAPTCHA required" };

  if (turnstile) {
    const body = new URLSearchParams({
      secret: turnstile,
      response: token,
    });
    if (input.remoteIp && input.remoteIp !== "unknown") body.set("remoteip", input.remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) return { ok: false, error: "CAPTCHA failed" };
    return { ok: true };
  }

  if (recaptcha) {
    const body = new URLSearchParams({
      secret: recaptcha,
      response: token,
    });
    if (input.remoteIp && input.remoteIp !== "unknown") body.set("remoteip", input.remoteIp);
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) return { ok: false, error: "CAPTCHA failed" };
    return { ok: true };
  }

  return { ok: false, error: "CAPTCHA not configured" };
}

export function normalizeIp(value: string): string | null {
  let candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  const zone = candidate.indexOf("%");
  if (zone >= 0) candidate = candidate.slice(0, zone);
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

function headerGet(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string | string[] | undefined>;
  const v = rec[name] ?? rec[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] || null;
  return v || null;
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function ipv4Number(value: string): bigint | null {
  const ip = normalizeIp(value);
  if (!ip || isIP(ip) !== 4) return null;
  return ip.split(".").reduce((out, octet) => (out << BigInt(8)) + BigInt(Number(octet)), BigInt(0));
}

function ipv6Number(value: string): bigint | null {
  const ip = normalizeIp(value);
  if (!ip || isIP(ip) !== 6) return null;
  const [headRaw, tailRaw = ""] = ip.split("::");
  const expandPart = (part: string): number[] => {
    if (!part) return [];
    const pieces = part.split(":");
    const out: number[] = [];
    for (const piece of pieces) {
      if (piece.includes(".")) {
        const v4 = ipv4Number(piece);
        if (v4 == null) return [];
        out.push(
          Number((v4 >> BigInt(16)) & BigInt(0xffff)),
          Number(v4 & BigInt(0xffff))
        );
      } else {
        out.push(parseInt(piece || "0", 16));
      }
    }
    return out;
  };
  const head = expandPart(headRaw);
  const tail = expandPart(tailRaw);
  const missing = 8 - head.length - tail.length;
  const words = ip.includes("::")
    ? [...head, ...Array(Math.max(0, missing)).fill(0), ...tail]
    : head;
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) {
    return null;
  }
  return words.reduce((out, word) => (out << BigInt(16)) + BigInt(word), BigInt(0));
}

export function ipInCidr(ipValue: string, cidr: string): boolean {
  const [networkValue, prefixValue] = cidr.trim().split("/");
  const version = isIP(normalizeIp(ipValue) || "");
  const networkVersion = isIP(normalizeIp(networkValue) || "");
  if (!version || version !== networkVersion) return false;
  const bits = version === 4 ? 32 : 128;
  const prefix = prefixValue === undefined ? bits : Number(prefixValue);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return false;
  const ip = version === 4 ? ipv4Number(ipValue) : ipv6Number(ipValue);
  const network = version === 4 ? ipv4Number(networkValue) : ipv6Number(networkValue);
  if (ip == null || network == null) return false;
  if (prefix === 0) return true;
  const shift = BigInt(bits - prefix);
  return (ip >> shift) === (network >> shift);
}

function proxyApproved(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  remoteAddress?: string | null
): boolean {
  const cidrs = (process.env.TRUST_PROXY_CIDRS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const remote = remoteAddress ? normalizeIp(remoteAddress) : null;
  if (remote && cidrs.some((cidr) => ipInCidr(remote, cidr))) return true;
  const expectedSecret = process.env.TRUST_PROXY_HEADER_SECRET;
  const suppliedSecret = headerGet(headers, "x-trusted-proxy-secret");
  return Boolean(expectedSecret && suppliedSecret && safeEqual(expectedSecret, suppliedSecret));
}

/** Resolve the address immediately before the configured trusted proxy hops. */
export function clientIpFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  options?: { remoteAddress?: string | null }
): string {
  if (process.env.TRUST_PROXY !== "1") return "unknown";
  if (!proxyApproved(headers, options?.remoteAddress)) return "unknown";
  const trustedHops = Number(process.env.TRUST_PROXY_HOPS || 1);
  if (!Number.isInteger(trustedHops) || trustedHops < 1 || trustedHops > 16) return "unknown";
  const xf = headerGet(headers, "x-forwarded-for");
  if (xf) {
    const hops = xf.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = hops.length - trustedHops;
    if (idx < 0) return "unknown";
    const candidate = normalizeIp(hops[idx]);
    if (candidate) return candidate;
  }
  const real = headerGet(headers, "x-real-ip");
  const normalized = real ? normalizeIp(real) : null;
  if (normalized) return normalized;
  return "unknown";
}

export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers);
}

/** Avoid a single global `unknown` bucket when the deployment cannot expose IPs. */
export function clientIdentity(req: Request): string {
  return clientIdentityFromHeaders(req.headers);
}

/** Build a stable anonymous identity for framework adapters that expose only headers. */
export function clientIdentityFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
  options?: { remoteAddress?: string | null }
): string {
  const ip = clientIpFromHeaders(headers, options);
  if (ip !== "unknown") return `ip:${ip}`;
  const anonymous =
    headerGet(headers, "x-anonymous-id") ||
    headerGet(headers, "cookie")?.match(/(?:^|;\s*)ict_anon=([^;]+)/)?.[1] ||
    [
      headerGet(headers, "user-agent") || "",
      headerGet(headers, "accept-language") || "",
      headerGet(headers, "sec-ch-ua-platform") || "",
    ].join("|");
  const digest = createHash("sha256")
    .update(anonymous || "no-client-context")
    .digest("hex")
    .slice(0, 32);
  return `anon:${digest}`;
}

/** Stable hash for duplicate submission detection */
export async function hashPayload(payload: unknown): Promise<string> {
  const canonical = JSON.stringify(payload ?? {});
  return createHash("sha256").update(canonical).digest("hex");
}
