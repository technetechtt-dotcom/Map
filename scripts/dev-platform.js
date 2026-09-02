#!/usr/bin/env node
/**
 * Run Next.js for a single platform (public map or ops console).
 * Usage: node scripts/dev-platform.js <public|ops> [--start]
 */
const { spawn } = require("child_process");

const platform = process.argv[2];
const start = process.argv.includes("--start");

if (!["public", "ops"].includes(platform)) {
  console.error("Usage: node scripts/dev-platform.js <public|ops> [--start]");
  process.exit(1);
}

const port = platform === "ops" ? "3001" : "3000";
const publicUrl = process.env.PUBLIC_APP_URL || "http://localhost:3000";
const opsUrl = process.env.OPS_APP_URL || "http://localhost:3001";

const env = {
  ...process.env,
  APP_PLATFORM: platform,
  NEXTAUTH_URL: platform === "ops" ? opsUrl : publicUrl,
  PUBLIC_APP_URL: publicUrl,
  OPS_APP_URL: opsUrl,
  NEXT_PUBLIC_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_PUBLIC_APP_URL || publicUrl,
  NEXT_PUBLIC_OPS_APP_URL: process.env.NEXT_PUBLIC_OPS_APP_URL || opsUrl,
};

const args = start ? ["next", "start", "-p", port] : ["next", "dev", "-p", port];
const child = spawn("npx", args, { env, stdio: "inherit", shell: true });

function shutdown(code) {
  if (!child.killed) child.kill("SIGTERM");
  process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
child.on("exit", (code) => process.exit(code ?? 0));
