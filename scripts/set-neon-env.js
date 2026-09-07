#!/usr/bin/env node
/**
 * Point local .env at Neon pooled + unpooled URLs.
 * Usage:
 *   NEON_DATABASE_URL='postgresql://...pooler...' NEON_DIRECT_URL='postgresql://...' node scripts/set-neon-env.js
 * If NEON_DIRECT_URL is omitted, pooler is stripped from the host.
 */
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");

const envPath = join(__dirname, "..", ".env");
const pooled = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!pooled) {
  console.error("Set NEON_DATABASE_URL (pooled Neon connection string)");
  process.exit(1);
}
const direct =
  process.env.NEON_DIRECT_URL ||
  pooled.replace("-pooler.", ".").replace(/[?&]pgbouncer=true/gi, "").replace(/\?&/, "?").replace(/\?$/, "");

function upsert(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.trimEnd()}\n${line}\n`;
}

let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
text = upsert(text, "DATABASE_URL", pooled);
text = upsert(text, "DIRECT_URL", direct);
writeFileSync(envPath, text.endsWith("\n") ? text : `${text}\n`, { encoding: "utf8", mode: 0o600 });

const host = (url) => {
  try {
    return new URL(url.replace(/^postgresql:/i, "http:")).hostname;
  } catch {
    return "(parse-error)";
  }
};

console.log(
  JSON.stringify(
    {
      ok: true,
      wrote: envPath,
      DATABASE_URL_host: host(pooled),
      DIRECT_URL_host: host(direct),
    },
    null,
    2
  )
);
