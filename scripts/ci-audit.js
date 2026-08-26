/**
 * CI dependency audit. Fails the production gate on any high or critical
 * advisory, including Next.js. Do not allowlist framework packages.
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

const vulns = report.vulnerabilities || {};
const blockers = [];

for (const [name, info] of Object.entries(vulns)) {
  const sev = info.severity;
  if (sev !== "high" && sev !== "critical") continue;
  blockers.push({ name, severity: sev, via: info.via });
}

if (blockers.length) {
  console.error(JSON.stringify(blockers, null, 2));
  process.exit(1);
}

console.log("Dependency audit OK (high+)");
