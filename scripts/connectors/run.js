#!/usr/bin/env node
/** Run one or all national connectors. Usage: node scripts/connectors/run.js [connector-id] */
const { execSync } = require("child_process");
const registry = require("./registry");

const target = process.argv[2];
const runnable = registry.connectors.filter((c) => c.health !== "DISABLED");
const list = target
  ? runnable.filter((c) => c.id === target || c.sourceId === target)
  : runnable;

if (target && list.length === 0) {
  console.error(`Unknown connector: ${target}`);
  process.exit(1);
}

/** Dedupe by sourceId so one logical runner does not re-ingest the same catalogue. */
const bySource = new Map();
for (const connector of list) {
  const sourceId = connector.sourceId || connector.id;
  if (!bySource.has(sourceId)) bySource.set(sourceId, connector);
}

for (const connector of bySource.values()) {
  const sourceId = connector.sourceId || connector.id;
  console.log(JSON.stringify({ connector: connector.id, sourceId, province: connector.province, status: "starting" }));
  execSync("npm run ingest:national", {
    stdio: "inherit",
    env: { ...process.env, CONNECTOR_ID: sourceId },
  });
  console.log(JSON.stringify({ connector: connector.id, sourceId, status: "completed" }));
}

console.log(JSON.stringify({ ok: true, ran: Array.from(bySource.keys()) }));
