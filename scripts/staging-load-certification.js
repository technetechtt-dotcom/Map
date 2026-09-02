#!/usr/bin/env node
/** Formal staging load certification — 250/500/1000 VUs + authenticated paths. */
const { spawnSync } = require("child_process");
const { join } = require("path");

const profiles = ["250", "500", "1000"];
const base = process.env.STAGING_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
const ops = process.env.OPS_APP_URL || "http://127.0.0.1:3001";

for (const profile of profiles) {
  console.log(`\n==> load profile ${profile}`);
  const k6 = spawnSync("k6", ["run", join(__dirname, "performance", "k6-national.js"), "-e", `BASE_URL=${base}`, "-e", `VUS=${profile}`], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (k6.status !== 0) process.exit(k6.status || 1);
}

console.log("\n==> authenticated ops load");
const auth = spawnSync("node", [join(__dirname, "performance", "authenticated-load.js")], {
  stdio: "inherit",
  env: { ...process.env, OPS_APP_URL: ops },
});
if (auth.status !== 0) process.exit(auth.status || 1);

spawnSync("node", [join(__dirname, "performance", "record-evidence.js")], { stdio: "inherit" });
console.log(JSON.stringify({ ok: true, profiles, base, ops }));
