import { NextResponse } from "next/server";

/** Unauthenticated liveness — process is up. No dependency or config details. */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
