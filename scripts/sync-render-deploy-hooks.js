#!/usr/bin/env node
/**
 * Replace GitHub Environment production deploy-hook secrets with live Render hooks.
 * Requires RENDER_API_KEY. Looks up sa-ict-map-public / sa-ict-map-ops (or RENDER_*_SERVICE_ID).
 */
const { spawnSync } = require("child_process");

const apiKey = (process.env.RENDER_API_KEY || "").trim();
if (!apiKey) {
  console.error("RENDER_API_KEY is required to list services and mint deploy hooks");
  process.exit(1);
}

async function render(pathname, init = {}) {
  const res = await fetch(`https://api.render.com/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`Render API ${pathname} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

function setSecret(name, value) {
  const result = spawnSync("gh", ["secret", "set", name, "--env", "production"], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`set ${name}`);
}

function serviceItems(payload) {
  if (Array.isArray(payload)) {
    return payload.map((row) => row.service || row).filter(Boolean);
  }
  return [];
}

async function findService(name, explicitId) {
  if (explicitId) {
    const row = await render(`/services/${explicitId}`);
    return row.service || row;
  }
  let cursor = "";
  for (let i = 0; i < 10; i += 1) {
    const qs = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
    const page = await render(`/services?${qs.toString()}`);
    const items = serviceItems(page);
    const match = items.find((service) => service.name === name || service.slug === name);
    if (match) return match;
    const next = Array.isArray(page) && page.length ? page[page.length - 1]?.cursor : null;
    if (!next) break;
    cursor = next;
  }
  throw new Error(`Render service ${name} not found`);
}

async function deployHookFor(service) {
  if (service.deployHookUrl || service.deployHook) return service.deployHookUrl || service.deployHook;
  const created = await render(`/services/${service.id}/deploy-hooks`, {
    method: "POST",
    body: JSON.stringify({ name: "github-production-gate" }),
  });
  const hook = created.deployHook || created;
  const url = hook.url || hook.deployHookUrl;
  if (!url) throw new Error(`Render did not return a deploy hook URL for ${service.name || service.id}`);
  return url;
}

async function main() {
  const publicService = await findService("sa-ict-map-public", process.env.RENDER_PRODUCTION_SERVICE_ID);
  const opsService = await findService("sa-ict-map-ops", process.env.RENDER_OPS_SERVICE_ID);
  const publicHook = await deployHookFor(publicService);
  const opsHook = await deployHookFor(opsService);
  if (!/^https:\/\/api\.render\.com\/deploy\/srv-/.test(publicHook) || !/^https:\/\/api\.render\.com\/deploy\/srv-/.test(opsHook)) {
    throw new Error("Render deploy hook URLs are not api.render.com/deploy/srv-… URLs");
  }
  if (publicHook === opsHook) throw new Error("Public and ops deploy hooks must be distinct");

  setSecret("PRODUCTION_DEPLOY_HOOK", publicHook);
  setSecret("OPS_DEPLOY_HOOK", opsHook);
  setSecret("RENDER_PRODUCTION_SERVICE_ID", publicService.id);
  setSecret("RENDER_OPS_SERVICE_ID", opsService.id);
  console.log(
    JSON.stringify({
      ok: true,
      publicServiceId: publicService.id,
      opsServiceId: opsService.id,
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
