/** Client-safe HTML escaping helpers used when building Leaflet popups. */
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
