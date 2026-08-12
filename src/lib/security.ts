/**
 * Client IP helper — never trusts forwarding headers unless TRUST_PROXY=1.
 */

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] || ch);
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

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

function looksLikeIp(value: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[0-9a-fA-F:]+$/.test(value);
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

/**
 * Resolve client IP. X-Forwarded-For / X-Real-IP are ignored unless TRUST_PROXY=1.
 * With a single trusted hop, use the left-most forwarded address after validating shape.
 */
export function clientIpFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined> | undefined
): string {
  if (process.env.TRUST_PROXY !== "1") return "unknown";
  const xf = headerGet(headers, "x-forwarded-for");
  if (xf) {
    const hops = xf.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = Math.max(0, hops.length - Number(process.env.TRUST_PROXY_HOPS || 1) - 0);
    // Default: first (client) when the proxy appends; override with TRUST_PROXY_USE_LAST=1
    const candidate = process.env.TRUST_PROXY_USE_LAST === "1" ? hops[hops.length - 1] : hops[0];
    void idx;
    if (candidate && looksLikeIp(candidate)) return candidate;
  }
  const real = headerGet(headers, "x-real-ip");
  if (real && looksLikeIp(real.trim())) return real.trim();
  return "unknown";
}

export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers);
}

/** Stable hash for duplicate submission detection */
export async function hashPayload(payload: unknown): Promise<string> {
  const { createHash } = await import("crypto");
  const canonical = JSON.stringify(payload ?? {});
  return createHash("sha256").update(canonical).digest("hex");
}
