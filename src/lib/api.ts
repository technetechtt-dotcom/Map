import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";

export async function requireSession(roles?: string[]) {
  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session?.user as any;
  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, user };
}

export function jsonOk<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init || 200 });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
