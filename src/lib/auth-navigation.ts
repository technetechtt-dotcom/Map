export type AuthPlatform = "public" | "ops";

const USER_ROLES = new Set([
  "SUPER_ADMIN",
  "PROVINCIAL_ADMIN",
  "ORG_ADMIN",
  "CONTRIBUTOR",
]);

function canAccessManagementPath(role: string, pathname: string): boolean {
  if (!USER_ROLES.has(role)) return false;
  if (pathname === "/admin/ops" || pathname.startsWith("/admin/ops/")) {
    return role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN";
  }
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN" || role === "ORG_ADMIN";
  }
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function parseManagementCallback(
  raw: string | null | undefined,
  platform: AuthPlatform
): { path: string; pathname: string } | null {
  if (platform !== "ops" || !raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }

  try {
    const base = "https://same-origin.invalid";
    const parsed = new URL(raw, base);
    const managementPath =
      parsed.pathname === "/admin" ||
      parsed.pathname.startsWith("/admin/") ||
      parsed.pathname === "/dashboard" ||
      parsed.pathname.startsWith("/dashboard/");
    if (parsed.origin !== base || !managementPath) return null;
    return {
      path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      pathname: parsed.pathname,
    };
  } catch {
    return null;
  }
}

/** Default same-origin destination after authentication. */
export function defaultPostAuthPath(platform: AuthPlatform, role: string): string {
  if (platform === "public") return "/";
  if (role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN") return "/admin/ops";
  if (USER_ROLES.has(role)) return "/admin";
  return "/";
}

/**
 * Accept only same-origin management callbacks that the authenticated role can
 * use. This prevents open redirects and avoids sending public-origin sessions
 * to the separately authenticated ops hostname.
 */
export function safePostAuthCallback(
  raw: string | null | undefined,
  platform: AuthPlatform,
  role: string
): string | null {
  const parsed = parseManagementCallback(raw, platform);
  if (!parsed || !canAccessManagementPath(role, parsed.pathname)) return null;
  return parsed.path;
}

/**
 * Choose a same-origin route immediately after sign-in. Middleware performs
 * the final role and forced-password checks using the newly issued JWT.
 */
export function requestedPostAuthPath(
  raw: string | null | undefined,
  platform: AuthPlatform
): string {
  return parseManagementCallback(raw, platform)?.path || "/";
}

export function postAuthPath(options: {
  platform: AuthPlatform;
  role: string;
  callbackUrl?: string | null;
  mustChangePassword?: boolean;
}): string {
  if (options.mustChangePassword) return "/account/security?force=1";
  return (
    safePostAuthCallback(options.callbackUrl, options.platform, options.role) ||
    defaultPostAuthPath(options.platform, options.role)
  );
}
