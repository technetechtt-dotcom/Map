/**
 * CI dependency audit. Fails on high+ except known Next 14.2 advisories
 * that require a major upgrade (tracked in docs/next15-upgrade.md).
 */
const { execSync } = require("child_process");

let raw = "";
try {
  raw = execSync("npm audit --json", { encoding: "utf8" });
} catch (e) {
  raw = e.stdout || "";
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("npm audit did not return JSON");
  process.exit(1);
}

const allowed = new Set(["next"]);
const vulns = report.vulnerabilities || {};
const blockers = [];

for (const [name, info] of Object.entries(vulns)) {
  const sev = info.severity;
  if (sev !== "high" && sev !== "critical") continue;
  if (allowed.has(name)) {
    console.log(`allowlisted ${sev} advisory in ${name} (Next 14.2 — see docs/next15-upgrade.md)`);
    continue;
  }
  blockers.push({ name, severity: sev, via: info.via });
}

if (blockers.length) {
  console.error(JSON.stringify(blockers, null, 2));
  process.exit(1);
}

console.log("Dependency audit OK (high+; Next 14.2 advisories documented)");
