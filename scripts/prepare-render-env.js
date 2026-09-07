#!/usr/bin/env node
/**
 * Write a gitignored paste sheet for Render Blueprint env prompts.
 * Usage: node scripts/prepare-render-env.js
 */
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const { randomBytes } = require("crypto");

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const root = join(__dirname, "..");
const env = parseEnv(join(root, ".env"));
const pooled = env.DATABASE_URL;
const direct = env.DIRECT_URL;
if (!pooled || !direct) {
  console.error("Set DATABASE_URL and DIRECT_URL in .env first (npm run neon:set-env)");
  process.exit(1);
}

const publicUrl = process.env.RENDER_PUBLIC_URL || "https://sa-ict-map-public.onrender.com";
const opsUrl = process.env.RENDER_OPS_URL || "https://sa-ict-map-ops.onrender.com";

const sheet = `# Render paste sheet — DO NOT COMMIT
# Generated ${new Date().toISOString()}
#
# 1. Dashboard → New → Blueprint → technetechtt-dotcom/Map (main)
# 2. When prompted for sa-ict-shared DATABASE_URL / DIRECT_URL, paste below
# 3. After first deploy, set URL vars on EACH service (or update Blueprint env)

# === Shared env group: sa-ict-shared ===
DATABASE_URL=${pooled}
DIRECT_URL=${direct}

# === Public service (sa-ict-map-public) ===
NEXTAUTH_URL=${publicUrl}
PUBLIC_APP_URL=${publicUrl}
OPS_APP_URL=${opsUrl}
NEXT_PUBLIC_PUBLIC_APP_URL=${publicUrl}
NEXT_PUBLIC_OPS_APP_URL=${opsUrl}

# === Ops service (sa-ict-map-ops) ===
# Use the SAME NEXTAUTH_SECRET / CRON_SECRET / METRICS_TOKEN / encryption keys as public
# (Blueprint env group already shares them if you used fromGroup)
NEXTAUTH_URL=${opsUrl}
PUBLIC_APP_URL=${publicUrl}
OPS_APP_URL=${opsUrl}
NEXT_PUBLIC_PUBLIC_APP_URL=${publicUrl}
NEXT_PUBLIC_OPS_APP_URL=${opsUrl}

# === After deploy: GitHub secrets ===
# npm run ops:finish-render -- ${publicUrl} ${opsUrl} <deploy-hook-url>
`;

const out = join(root, ".env.render");
writeFileSync(out, sheet, { encoding: "utf8", mode: 0o600 });
console.log(
  JSON.stringify(
    {
      ok: true,
      wrote: out,
      publicUrl,
      opsUrl,
      next: [
        "Open https://dashboard.render.com/blueprints/new",
        "Connect repo technetechtt-dotcom/Map branch main",
        "Paste DATABASE_URL + DIRECT_URL from .env.render when prompted",
        "After live URLs exist: npm run ops:finish-render -- <publicUrl> <opsUrl> [deployHook]",
      ],
    },
    null,
    2
  )
);
void randomBytes;
