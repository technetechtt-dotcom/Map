import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import type { AuthUser } from "./policy";
import { clientIdentity } from "./security";
import { rateLimit, rateLimitAsync } from "./rate-limit";
import { prisma } from "./prisma";

let envChecked = false;

/**
 * Authenticate and load **current** DB user (roles, tenants, sessionVersion).
 * Rejects disabled users and revoked sessions.
 */
export async function requireSession(roles?: string[]) {
  if (!envChecked) {
    envChecked = true;
    try {
      const { assertEnvOrLog } = await import("./env");
      assertEnvOrLog();
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
    }
  }

  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenUser = session?.user as any as AuthUser | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((session as any)?.error === "SessionRevoked" || !tokenUser?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: tokenUser.id },
    select: {
      id: true,
      email: true,
      role: true,
      provinceId: true,
      organisationId: true,
      active: true,
      sessionVersion: true,
      mustChangePassword: true,
      mfaEnabled: true,
    },
  });

  if (!dbUser || !dbUser.active) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (
    typeof tokenUser.sessionVersion === "number" &&
    dbUser.sessionVersion !== tokenUser.sessionVersion
  ) {
    return {
      error: NextResponse.json(
        { error: "Session revoked — please sign in again" },
        { status: 401 }
      ),
    };
  }

  const user: AuthUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    provinceId: dbUser.provinceId,
    organisationId: dbUser.organisationId,
    sessionVersion: dbUser.sessionVersion,
    mustChangePassword: dbUser.mustChangePassword,
    mfaEnabled: dbUser.mfaEnabled,
    active: dbUser.active,
  };

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

export function enforceRateLimit(
  req: Request,
  bucket: string,
  opts: { limit: number; windowMs: number },
  userId?: string | null
): NextResponse | null {
  const key = userId ? `${bucket}:u:${userId}` : `${bucket}:${clientIdentity(req)}`;
  const result = rateLimit(key, opts);
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

export async function enforceRateLimitAsync(
  req: Request,
  bucket: string,
  opts: { limit: number; windowMs: number },
  userId?: string | null
): Promise<NextResponse | null> {
  const key = userId ? `${bucket}:u:${userId}` : `${bucket}:${clientIdentity(req)}`;
  const result = await rateLimitAsync(key, opts);
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
