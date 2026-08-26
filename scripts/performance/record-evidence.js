#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const summaryPath = process.argv[2] || process.env.K6_SUMMARY || "";
const profile = process.env.LOAD_PROFILE || "ci";
const sha = process.env.GITHUB_SHA || process.env.GIT_COMMIT || "";
const locations = Number(process.env.SCALE_LOCATIONS || 0);
const payload = {
  sha,
  profile,
  datasetSize: locations,
  recordedAt: new Date().toISOString(),
  metrics: null,
};
if (summaryPath && fs.existsSync(summaryPath)) {
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    const duration = summary.metrics?.http_req_duration?.values || summary.metrics?.http_req_duration || {};
    payload.metrics = {
      p50: duration.med || duration["p(50)"] || null,
      p95: duration["p(95)"] || null,
      p99: duration["p(99)"] || null,
      failureRate: summary.metrics?.http_req_failed?.values?.rate || summary.metrics?.http_req_failed?.rate || null,
      iterations: summary.metrics?.iterations?.values?.count || summary.metrics?.iterations?.count || null,
    };
  } catch (error) {
    payload.error = error instanceof Error ? error.message : String(error);
  }
}
const dir = path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "performance-evidence.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload));
