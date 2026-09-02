#!/usr/bin/env node
/** Start public map (:3000) and ops console (:3001) together. */
const { spawn } = require("child_process");

const children = ["public", "ops"].map((platform) =>
  spawn("node", ["scripts/dev-platform.js", platform], {
    stdio: "inherit",
    shell: true,
  })
);

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown();
  });
}
