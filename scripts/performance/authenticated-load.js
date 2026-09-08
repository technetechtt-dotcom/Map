#!/usr/bin/env node
/**
 * Authenticated smoke against an isolated app. Never point at production Neon.
 */
const base = process.env.OPS_APP_URL || process.env.BASE_URL || "http://127.0.0.1:3001";
const email = process.env.SEED_ADMIN_EMAIL || "admin@ictmap.gov.za";
const password = process.env.SEED_ADMIN_PASSWORD || "";

function cookies(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]);
}

function mergeCookies(...groups) {
  const jar = new Map();
  for (const item of groups.flat()) {
    const separator = item.indexOf("=");
    if (separator > 0) jar.set(item.slice(0, separator), item);
  }
  return [...jar.values()].join("; ");
}

async function fetchWithRetry(url, init = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  const detail = lastError instanceof Error && lastError.cause ? `: ${String(lastError.cause)}` : "";
  throw new Error(`Request failed after retries for ${url}${detail}`, { cause: lastError });
}

async function main() {
  if (!password) {
    console.log(JSON.stringify({ skipped: true, reason: "SEED_ADMIN_PASSWORD not set" }));
    return;
  }
  const csrfRes = await fetchWithRetry(`${base}/api/auth/csrf`);
  if (!csrfRes.ok) throw new Error(`CSRF endpoint returned ${csrfRes.status}`);
  const csrf = await csrfRes.json();
  if (!csrf.csrfToken) throw new Error("CSRF response did not include a token");
  const csrfCookies = cookies(csrfRes);
  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    json: "true",
  });
  const login = await fetchWithRetry(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: mergeCookies(csrfCookies),
    },
    body,
    redirect: "manual",
  });
  if (login.status >= 400) throw new Error(`Credential callback returned ${login.status}`);
  const sessionCookie = mergeCookies(csrfCookies, cookies(login));
  const session = await fetchWithRetry(`${base}/api/auth/session`, {
    headers: { cookie: sessionCookie },
  });
  const sessionBody = await session.json();
  const admin = await fetchWithRetry(`${base}/api/admin/ops/summary`, {
    headers: { cookie: sessionCookie },
  });
  const quality = await fetchWithRetry(`${base}/api/admin/data-quality`, {
    headers: { cookie: sessionCookie },
  });
  const report = {
    login: login.status,
    session: session.status,
    ops: admin.status,
    quality: quality.status,
  };
  console.log(JSON.stringify(report));
  if (!session.ok || sessionBody?.user?.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Authenticated session was not established");
  }
  if (!admin.ok || !quality.ok) throw new Error("Authenticated ops endpoints were not healthy");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
