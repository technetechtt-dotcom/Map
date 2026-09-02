#!/usr/bin/env node
/**
 * Create a dated Neon branch from production main as a recoverable snapshot.
 * Skips (exit 0) when NEON_API_KEY / NEON_PROJECT_ID are not configured.
 */
const key = (process.env.NEON_API_KEY || "").trim();
const projectId = (process.env.NEON_PROJECT_ID || "").trim();

async function main() {
  if (!key || !projectId) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "NEON_API_KEY or NEON_PROJECT_ID not set" }));
    return;
  }
  const name = `backup-${new Date().toISOString().slice(0, 10)}`;
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      branch: { name },
      endpoints: [],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (res.status === 409) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "branch already exists", branch: name }));
    return;
  }
  if (!res.ok) {
    console.error(JSON.stringify({ ok: false, status: res.status, body: text.slice(0, 500) }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, branch: name, status: res.status }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
