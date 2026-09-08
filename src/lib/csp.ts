/**
 * Convert a configured application URL to a safe CSP origin.
 *
 * Render environment values can accidentally include trailing line breaks when
 * pasted in the dashboard. Trimming those values prevents an otherwise valid
 * URL from making the entire response header invalid. Embedded control
 * characters and non-HTTP(S) schemes are rejected rather than copied into CSP.
 */
export function toCspOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value || /[\r\n]/.test(value)) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Return unique, space-separated HTTP(S) origins for a CSP source list. */
export function cspOrigins(values: Array<string | undefined>): string {
  return Array.from(
    new Set(values.map(toCspOrigin).filter((origin): origin is string => Boolean(origin)))
  ).join(" ");
}
