/**
 * Platform split: public map (citizens) vs ops console (staff).
 * Each runs as a separate origin locally and in production.
 */

export type AppPlatform = "public" | "ops";

const OPS_UI_PREFIXES = [
  "/admin",
  "/login",
  "/account",
  "/accept-invite",
  "/dashboard",
  "/reset-password",
] as const;

const INFRA_PREFIXES = ["/_next", "/favicon.ico", "/api/health"] as const;

export function getAppPlatform(): AppPlatform {
  const raw = (process.env.APP_PLATFORM || "public").trim().toLowerCase();
  return raw === "ops" ? "ops" : "public";
}

export function isOpsPlatform(): boolean {
  return getAppPlatform() === "ops";
}

export function isPublicPlatform(): boolean {
  return getAppPlatform() === "public";
}

export function getPublicAppUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export function getOpsAppUrl(): string {
  return (
    process.env.OPS_APP_URL ||
    process.env.NEXT_PUBLIC_OPS_APP_URL ||
    "http://localhost:3001"
  );
}

export function isInfraRoute(pathname: string): boolean {
  return INFRA_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isOpsRoute(pathname: string): boolean {
  if (isInfraRoute(pathname)) return false;
  if (OPS_UI_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/auth")) return true;
  return false;
}

/** Routes served on the public map origin (localhost:3000 / map domain). */
export function isAllowedOnPublicPlatform(pathname: string): boolean {
  if (isInfraRoute(pathname)) return true;
  if (pathname.startsWith("/api/csp-report")) return true;
  if (pathname.startsWith("/api/")) {
    return !pathname.startsWith("/api/admin") && !pathname.startsWith("/api/auth");
  }
  return !isOpsRoute(pathname);
}

/** Routes served on the ops console origin (localhost:3001 / ops domain). */
export function isAllowedOnOpsPlatform(pathname: string): boolean {
  if (isInfraRoute(pathname)) return true;
  if (pathname.startsWith("/api/csp-report")) return true;
  if (isOpsRoute(pathname)) return true;
  if (pathname === "/") return true;
  return false;
}

export function absoluteOpsUrl(pathname: string, search = ""): string {
  const base = getOpsAppUrl().replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}${search}`;
}

export function absolutePublicUrl(pathname: string, search = ""): string {
  const base = getPublicAppUrl().replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}${search}`;
}
