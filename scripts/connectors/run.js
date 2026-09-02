#!/usr/bin/env node
/** Run one or all national connectors. Usage: node scripts/connectors/run.js [connector-id] */
const { execSync } = require("child_process");
const registry = require("./registry");

const target = process.argv[2];
const list = target ? registry.connectors.filter((c) => c.id === target) : registry.connectors.filter((c) => c.status === "active");

if (target && list.length === 0) {
  console.error(`Unknown connector: ${target}`);
  process.exit(1);
}

for (const connector of list) {
  console.log(JSON.stringify({ connector: connector.id, province: connector.province, status: "starting" }));
  execSync("npm run ingest:national", { stdio: "inherit", env: { ...process.env, CONNECTOR_ID: connector.id } });
  console.log(JSON.stringify({ connector: connector.id, status: "completed" }));
}

console.log(JSON.stringify({ ok: true, ran: list.map((c) => c.id) }));
