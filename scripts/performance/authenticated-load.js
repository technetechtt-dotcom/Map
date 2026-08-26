#!/usr/bin/env node
/**
 * Authenticated smoke against an isolated app. Never point at production Neon.
 */
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const email = process.env.SEED_ADMIN_EMAIL || "admin@ictmap.gov.za";
const password = process.env.SEED_ADMIN_PASSWORD || "";

async function main() {
  if (!password) {
    console.log(JSON.stringify({ skipped: true, reason: "SEED_ADMIN_PASSWORD not set" }));
    return;
  }
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const csrf = await csrfRes.json();
  const cookie = csrfRes.headers.get("set-cookie") || "";
  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    json: "true",
  });
  const login = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body,
    redirect: "manual",
  });
  const sessionCookie = login.headers.get("set-cookie") || cookie;
  const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: sessionCookie } });
  const admin = await fetch(`${base}/api/admin/ops/summary`, { headers: { cookie: sessionCookie } });
  const quality = await fetch(`${base}/api/admin/data-quality`, { headers: { cookie: sessionCookie } });
  const report = {
    login: login.status,
    session: session.status,
    ops: admin.status,
    quality: quality.status,
  };
  console.log(JSON.stringify(report));
  if (admin.status >= 500 || quality.status >= 500) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
