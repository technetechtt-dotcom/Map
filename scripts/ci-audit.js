/**
 * CI dependency audit. Fails the production gate on any high or critical
 * advisory. Temporary waivers must identify the advisory source, document why
 * no safe upgrade exists, and expire automatically.
 */
const { execSync } = require("child_process");

const TEMPORARY_WAIVERS = new Map([
  [
    1247710,
    {
      ghsa: "GHSA-fc5q-39xc-vjpf",
      package: "picomatch",
      expires: "2026-12-02T00:00:00Z",
      reason:
        "No patched picomatch npm release exists as of 2026-11-18. Re-review upstream before expiry; all other high/critical advisories remain blocking.",
    },
  ],
]);

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

function advisorySources(name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const info = vulns[name];
  const sources = new Set();
  for (const via of info?.via || []) {
    if (via && typeof via === "object" && typeof via.source === "number") {
      sources.add(via.source);
    } else if (typeof via === "string" && vulns[via]) {
      for (const source of advisorySources(via, seen)) sources.add(source);
    }
  }
  return sources;
}

function waiverActive(source) {
  const waiver = TEMPORARY_WAIVERS.get(source);
  if (!waiver) return false;
  return Date.now() < Date.parse(waiver.expires);
}

const blockers = [];
const waived = [];

for (const [name, info] of Object.entries(vulns)) {
  const sev = info.severity;
  if (sev !== "high" && sev !== "critical") continue;

  const sources = [...advisorySources(name)];
  const canWaive =
    sev === "high" &&
    sources.length > 0 &&
    sources.every((source) => waiverActive(source));

  if (canWaive) {
    waived.push({ name, severity: sev, advisorySources: sources });
    continue;
  }

  blockers.push({
    name,
    severity: sev,
    advisorySources: sources,
    via: info.via,
  });
}

if (waived.length) {
  console.warn("Temporary dependency-audit waiver applied:");
  console.warn(JSON.stringify(waived, null, 2));
  for (const [source, waiver] of TEMPORARY_WAIVERS) {
    if (waived.some((item) => item.advisorySources.includes(source))) {
      console.warn(
        `${waiver.ghsa} (${waiver.package}) expires ${waiver.expires}: ${waiver.reason}`
      );
    }
  }
}

if (blockers.length) {
  console.error(JSON.stringify(blockers, null, 2));
  process.exit(1);
}

console.log("Dependency audit OK (high+; any temporary waivers are time-limited above)");
