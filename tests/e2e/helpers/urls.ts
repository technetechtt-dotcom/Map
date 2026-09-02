export const OPS_BASE = process.env.PLAYWRIGHT_OPS_BASE_URL || "http://127.0.0.1:3001";

export function opsUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${OPS_BASE.replace(/\/$/, "")}${normalized}`;
}
