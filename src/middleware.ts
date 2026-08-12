import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Protect admin UI routes, force password change, optional maintenance, security headers.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const maintenance =
    process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";
  if (maintenance) {
    const allow =
      pathname.startsWith("/api/health") ||
      pathname.startsWith("/api/auth") ||
      pathname === "/login" ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/admin") || // admins may still sign in to ops surfaces
      pathname.startsWith("/api/admin");
    if (!allow && !pathname.startsWith("/maintenance")) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      const role = (token as { role?: string } | null)?.role;
      if (role !== "SUPER_ADMIN") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Service temporarily unavailable", maintenance: true },
            { status: 503 }
          );
        }
        return NextResponse.redirect(new URL("/maintenance", req.url));
      }
    }
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const role = (token as { role?: string; invalid?: boolean } | null)?.role;
    if (!token || !role || (token as { invalid?: boolean }).invalid) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(login);
    }
    const allowed = ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"];
    if (!allowed.includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (
      (token as { mustChangePassword?: boolean }).mustChangePassword &&
      !pathname.startsWith("/account/security")
    ) {
      return NextResponse.redirect(new URL("/account/security?force=1", req.url));
    }
  }

  // Force password change for authenticated callers hitting account pages except security
  if (pathname.startsWith("/account") && !pathname.startsWith("/account/security")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if ((token as { mustChangePassword?: boolean } | null)?.mustChangePassword) {
      return NextResponse.redirect(new URL("/account/security?force=1", req.url));
    }
  }

  const res = NextResponse.next();
  const isProd = process.env.NODE_ENV === "production";
  const strictCsp = process.env.CSP_STRICT === "1" || (isProd && process.env.CSP_STRICT !== "0");

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const tileConnect =
    process.env.MAP_TILE_CONNECT_SRC ||
    "https://*.tile.openstreetmap.org https://tile.openstreetmap.org";
  const tileImg = process.env.MAP_TILE_IMG_SRC || "https://*.tile.openstreetmap.org https://tile.openstreetmap.org";

  const scriptSrc = strictCsp
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`
    : `'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com`;

  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      `img-src 'self' data: blob: ${tileImg}`,
      "font-src 'self' data:",
      `connect-src 'self' ${tileConnect} https://challenges.cloudflare.com`,
      "frame-src 'self' https://challenges.cloudflare.com https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      process.env.CSP_REPORT_URI ? `report-uri ${process.env.CSP_REPORT_URI}` : "",
      process.env.CSP_REPORT_URI ? `report-to csp-endpoint` : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  res.headers.set("x-nonce", nonce);

  if (isProd) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
