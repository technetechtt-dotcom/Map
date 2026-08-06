/**
 * Security helpers: XSS escaping, payload limits, CAPTCHA checks.
 */

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text before injecting into HTML/Leaflet popups */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] || ch);
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

/** Max JSON body size (bytes) for non-upload APIs */
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

/**
 * CAPTCHA: production requires TURNSTILE_SECRET (or RECAPTCHA_SECRET).
 * Honeypot field `website` must be empty.
 * Development may skip when CAPTCHA_DISABLED=1.
 */
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
    if (input.remoteIp) body.set("remoteip", input.remoteIp);
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
    if (input.remoteIp) body.set("remoteip", input.remoteIp);
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

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
