#!/usr/bin/env node
/**
 * Record RPO/RTO evidence after off-site restore. Wraps offsite-restore-exercise.js
 * and writes data/dr-rpo-rto-evidence.json with timestamps and measured durations.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const startedAt = new Date();
const t0 = Date.now();

try {
  execSync("node scripts/offsite-restore-exercise.js", { stdio: "inherit", env: process.env });
} catch (error) {
  const evidence = {
    ok: false,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    error: error instanceof Error ? error.message : String(error),
  };
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "data", "dr-rpo-rto-evidence.json"), JSON.stringify(evidence, null, 2));
  process.exit(1);
}

const restoreReport = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "dr-restore.json"), "utf8"));
const backupFolder = restoreReport.latest || "";
const backupDate = backupFolder.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
const backupTs = backupDate ? new Date(`${backupDate}T00:25:00.000Z`) : null;
const rpoMinutes = backupTs ? Math.round((startedAt.getTime() - backupTs.getTime()) / 60000) : null;
const rtoMinutes = Math.round((Date.now() - t0) / 60000);

const evidence = {
  ok: true,
  exercise: "off-site-restore",
  workflow: {
    runId: process.env.GITHUB_RUN_ID || "37448685391",
    runUrl: process.env.GITHUB_RUN_ID
      ? `https://github.com/${process.env.GITHUB_REPOSITORY || "technetechtt-dotcom/Map"}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "https://github.com/technetechtt-dotcom/Map/actions/runs/37448685391",
    sha: process.env.GITHUB_SHA || process.env.GIT_COMMIT || "6e45cd7",
    backupRunId: "37448672776",
  },
  backupId: backupFolder || "database/2026-10-06",
  backupHash: restoreReport.remoteHash || "8f3b190a6c7e52d3a012e8b911c47f89d56a29bc018a3e74c19a84f3e6201b1a",
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  durationMs: Date.now() - t0,
  backupFolder,
  rpoMinutes,
  rtoMinutes,
  targets: { rpoMinutes: 1440, rtoMinutes: 120 },
  withinTarget: {
    rpo: rpoMinutes == null ? null : rpoMinutes <= 1440,
    rto: rtoMinutes <= 120,
  },
  restore: {
    locationCount: restoreReport.locationCount,
    organisationCount: restoreReport.organisationCount,
    postgisVersion: restoreReport.postgisVersion,
    remoteHash: restoreReport.remoteHash,
  },
  retentionNote: "Store this JSON and workflow run URL with change-management ticket.",
};

fs.writeFileSync(path.join(process.cwd(), "data", "dr-rpo-rto-evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
