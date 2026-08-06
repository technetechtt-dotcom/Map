import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Protect admin UI routes and attach security headers to all responses.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Gate management UI (APIs enforce auth separately)
  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const role = (token as { role?: string } | null)?.role;
    if (!token || !role) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(login);
    }
    const allowed = ["SUPER_ADMIN", "PROVINCIAL_ADMIN", "ORG_ADMIN", "CONTRIBUTOR"];
    if (!allowed.includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  const res = NextResponse.next();
  const isProd = process.env.NODE_ENV === "production";

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://challenges.cloudflare.com",
      "frame-src 'self' https://challenges.cloudflare.com https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  if (isProd) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/|maps/).*)",
  ],
};
