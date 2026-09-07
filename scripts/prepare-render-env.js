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

function gen(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

const root = join(__dirname, "..");
const env = parseEnv(join(root, ".env"));
const prior = parseEnv(join(root, ".env.render"));
const pooled = env.DATABASE_URL;
const direct = env.DIRECT_URL;
if (!pooled || !direct) {
  console.error("Set DATABASE_URL and DIRECT_URL in .env first (npm run neon:set-env)");
  process.exit(1);
}

const publicUrl = process.env.RENDER_PUBLIC_URL || prior.PUBLIC_APP_URL || "https://sa-ict-map-public.onrender.com";
const opsUrl = process.env.RENDER_OPS_URL || prior.OPS_APP_URL || "https://sa-ict-map-ops.onrender.com";

const secrets = {
  NEXTAUTH_SECRET: prior.NEXTAUTH_SECRET || env.NEXTAUTH_SECRET || gen(32),
  BACKUP_ENCRYPTION_KEY: prior.BACKUP_ENCRYPTION_KEY || env.BACKUP_ENCRYPTION_KEY || gen(24),
  MFA_ENCRYPTION_KEY: prior.MFA_ENCRYPTION_KEY || env.MFA_ENCRYPTION_KEY || gen(32),
  CRON_SECRET: prior.CRON_SECRET || env.CRON_SECRET || gen(32),
  METRICS_TOKEN: prior.METRICS_TOKEN || env.METRICS_TOKEN || gen(32),
};

const notify = prior.NOTIFY_WEBHOOK_URL || env.NOTIFY_WEBHOOK_URL || "";
const resend = prior.RESEND_API_KEY || env.RESEND_API_KEY || "";

const sheet = `# Render paste sheet — DO NOT COMMIT
# Generated ${new Date().toISOString()}
# Use the SAME secret values on public + ops (or shared env group).

# ========== SHARED (sa-ict-shared / both services) ==========
DATABASE_URL=${pooled}
DIRECT_URL=${direct}
NEXTAUTH_SECRET=${secrets.NEXTAUTH_SECRET}
BACKUP_ENCRYPTION_KEY=${secrets.BACKUP_ENCRYPTION_KEY}
MFA_ENCRYPTION_KEY=${secrets.MFA_ENCRYPTION_KEY}
CRON_SECRET=${secrets.CRON_SECRET}
METRICS_TOKEN=${secrets.METRICS_TOKEN}
NOTIFY_WEBHOOK_URL=${notify || "https://example.invalid/notify-placeholder"}
RESEND_API_KEY=${resend || "re_placeholder_not_for_production"}

# ========== PUBLIC service: sa-ict-map-public ==========
NEXTAUTH_URL=${publicUrl}
PUBLIC_APP_URL=${publicUrl}
OPS_APP_URL=${opsUrl}
NEXT_PUBLIC_PUBLIC_APP_URL=${publicUrl}
NEXT_PUBLIC_OPS_APP_URL=${opsUrl}

# ========== OPS service: sa-ict-map-ops ==========
# Paste identical DATABASE_URL, DIRECT_URL, and all secrets from SHARED above.
NEXTAUTH_URL=${opsUrl}
PUBLIC_APP_URL=${publicUrl}
OPS_APP_URL=${opsUrl}
NEXT_PUBLIC_PUBLIC_APP_URL=${publicUrl}
NEXT_PUBLIC_OPS_APP_URL=${opsUrl}

# After deploy: fix NEXTAUTH_URL per service (critical)
# PUBLIC service NEXTAUTH_URL must be https://sa-ict-map-public.onrender.com
# OPS service NEXTAUTH_URL must be https://sa-ict-map-ops.onrender.com
# Same PUBLIC_APP_URL / OPS_APP_URL on both. Wrong NEXTAUTH_URL causes CSP + CLIENT_FETCH_ERROR.
#
# After live: npm run ops:finish-render -- ${publicUrl} ${opsUrl} [deployHook]
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
      placeholders: {
        NOTIFY_WEBHOOK_URL: !notify,
        RESEND_API_KEY: !resend,
      },
      reminder: "Open .env.render and paste into Render. Secrets must match on both services.",
    },
    null,
    2
  )
);
