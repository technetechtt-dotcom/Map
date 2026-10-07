import { NextResponse } from "next/server";

function deployedSha() {
  return (
    [
      process.env.GIT_COMMIT,
      process.env.RENDER_GIT_COMMIT,
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.GITHUB_SHA,
    ].find((value) => Boolean(value && String(value).trim())) || null
  );
}

/** Unauthenticated liveness — process is up. Includes the public git SHA for deploy proof. */
export async function GET() {
  return NextResponse.json(
    { status: "ok", sha: deployedSha() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
