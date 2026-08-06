import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import type { AuthUser } from "./policy";
import { clientIp } from "./security";
import { rateLimit } from "./rate-limit";

export async function requireSession(roles?: string[]) {
  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session?.user as any as AuthUser | undefined;
  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role || "")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, user };
}

export function jsonOk<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init || 200 });
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Apply rate limit; returns Response when blocked */
export function enforceRateLimit(
  req: Request,
  bucket: string,
  opts: { limit: number; windowMs: number }
): NextResponse | null {
  const ip = clientIp(req);
  const result = rateLimit(`${bucket}:${ip}`, opts);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: result.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSec) },
      }
    );
  }
  return null;
}
