#!/usr/bin/env node
/**
 * Record a verified backup channel against production Neon.
 * Prefer direct Prisma insert so GitHub/Render CRON_SECRET drift cannot drop the health write.
 * HTTP to /api/admin/backups/record remains a secondary path.
 */
const { PrismaClient } = require("@prisma/client");

function env(name) {
  return (process.env[name] || "").trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function recordViaHttp(payload) {
  const appUrl = (env("PRODUCTION_APP_URL") || env("APP_URL")).replace(/\/$/, "");
  const secret = env("CRON_SECRET");
  if (!appUrl || !secret) return { ok: false, skipped: true };
  const res = await fetch(`${appUrl}/api/admin/backups/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
}

async function main() {
  const fs = require("fs");
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: node scripts/record-backup-health.js '<json-or-file>'");
    process.exit(1);
  }
  const payload = JSON.parse(fs.existsSync(raw) ? fs.readFileSync(raw, "utf8") : raw);
  const kind = String(payload.kind || "");
  if (!["database", "objects", "app-export", "appExport"].includes(kind)) {
    console.error("kind must be database, objects, or app-export");
    process.exit(1);
  }
  const normalizedKind = kind === "appExport" ? "app-export" : kind;
  const data = {
    kind: normalizedKind,
    filename: String(payload.filename || `${normalizedKind}-${new Date().toISOString()}`).slice(0, 200),
    path: String(payload.path || "offsite").slice(0, 500),
    sizeBytes: num(payload.sizeBytes),
    checksumSha256: payload.checksumSha256 || null,
    objectsCopied: num(payload.objectsCopied || payload.copiedObjects),
    lastVerifiedAt: new Date(),
    rpoMinutes: num(payload.rpoMinutes, 24 * 60),
    rtoMinutes: 120,
    notes: "Recorded by scheduled backup pipeline",
    status: payload.status || "SUCCESS",
    attemptedObjects: num(payload.attemptedObjects),
    copiedObjects: num(payload.copiedObjects || payload.objectsCopied),
    verifiedObjects: num(payload.verifiedObjects),
    failedObjects: num(payload.failedObjects),
    startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
    completedAt: payload.completedAt ? new Date(payload.completedAt) : new Date(),
    manifestHash: payload.manifestHash || payload.checksumSha256 || null,
    failureReason: payload.failureReason || null,
    measuredRtoMinutes: payload.measuredRtoMinutes != null ? num(payload.measuredRtoMinutes) : null,
  };
  if (payload.cursorJson && typeof payload.cursorJson === "object") data.cursorJson = payload.cursorJson;
  if (payload.backupRunId) data.backupRunId = payload.backupRunId;

  const url = env("PRODUCTION_DATABASE_URL") || env("DATABASE_URL");
  if (!url) {
    console.error("PRODUCTION_DATABASE_URL is required to record backup health");
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    let record;
    if (data.backupRunId) {
      const existing = await prisma.backupRecord.findUnique({ where: { backupRunId: data.backupRunId } });
      record = existing
        ? await prisma.backupRecord.update({ where: { id: existing.id }, data })
        : await prisma.backupRecord.create({ data });
    } else {
      record = await prisma.backupRecord.create({ data });
    }
    const http = await recordViaHttp({ ...payload, kind: normalizedKind }).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    console.log(JSON.stringify({ ok: true, id: record.id, kind: record.kind, backupRunId: record.backupRunId, http }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
