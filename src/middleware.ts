import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  absoluteOpsUrl,
  absolutePublicUrl,
  getAppPlatform,
  isAllowedOnOpsPlatform,
  isOpsRoute,
} from "@/lib/platform";

/**
 * Protect admin UI routes, force password change, optional maintenance, security headers.
 * Public map and ops console are separate origins (APP_PLATFORM=public|ops).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const platform = getAppPlatform();

  if (platform === "public" && isOpsRoute(pathname)) {
    return NextResponse.redirect(absoluteOpsUrl(pathname, req.nextUrl.search));
  }

  if (platform === "ops" && !isAllowedOnOpsPlatform(pathname)) {
    return NextResponse.redirect(absolutePublicUrl(pathname, req.nextUrl.search));
  }

  if (platform === "ops" && pathname === "/") {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const role = (token as { role?: string; invalid?: boolean } | null)?.role;
    if (token && role && !(token as { invalid?: boolean }).invalid) {
      const opsHome =
        role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN" ? "/admin/ops" : "/admin";
      return NextResponse.redirect(new URL(opsHome, req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const anonymousId =
    req.cookies.get("ict_anon")?.value || crypto.randomUUID().replace(/-/g, "");

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
    if (pathname.startsWith("/admin/ops") && role !== "SUPER_ADMIN" && role !== "PROVINCIAL_ADMIN") {
      return NextResponse.redirect(new URL("/admin", req.url));
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

  const isProd = process.env.NODE_ENV === "production";
  const strictCsp = process.env.CSP_STRICT === "1" || (isProd && process.env.CSP_STRICT !== "0");
  const cspReportUri = process.env.CSP_REPORT_URI || (isProd ? "/api/csp-report" : "");

  const tileConnect =
    process.env.MAP_TILE_CONNECT_SRC ||
    "https://*.tile.openstreetmap.org https://tile.openstreetmap.org";
  const tileImg = process.env.MAP_TILE_IMG_SRC || "https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://unpkg.com";

  // next dev / webpack Fast Refresh evaluates strings (eval). That is forbidden
  // in production CSP and must stay forbidden on `next start`.
  const webpackEval = isProd ? "" : " 'unsafe-eval' 'wasm-unsafe-eval'";
  const hmrConnect = isProd ? "" : " ws: wss: http://127.0.0.1:* http://localhost:*";

  const scriptSrc = strictCsp
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${webpackEval} https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com`
    : `'self' 'unsafe-inline'${webpackEval} https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com`;

  const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      `img-src 'self' data: blob: ${tileImg}`,
      "font-src 'self' data:",
      `connect-src 'self' ${tileConnect} https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io${hmrConnect}`,
      "frame-src 'self' https://challenges.cloudflare.com https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      cspReportUri ? `report-uri ${cspReportUri}` : "",
      cspReportUri ? `report-to csp-endpoint` : "",
    ]
      .filter(Boolean)
      .join("; ");

  // Next.js reads the nonce from the incoming CSP header and applies it to
  // framework/bootstrap scripts. The same policy must also reach the browser.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-nonce", nonce);
  // Always overwrite the inbound value so clients cannot select another
  // visitor's anonymous rate-limit bucket.
  requestHeaders.set("x-anonymous-id", anonymousId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", nonce);
  res.cookies.set("ict_anon", anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  if (cspReportUri) {
    res.headers.set(
      "Reporting-Endpoints",
      `csp-endpoint="${cspReportUri.replace(/"/g, "")}"`
    );
  }

  if (isProd) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
