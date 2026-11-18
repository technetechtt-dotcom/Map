/**
 * CI dependency audit. Fails on unwaived HIGH/CRITICAL root advisories.
 * npm can assign a parent package the highest severity of all transitive
 * findings, so evaluate the underlying advisory objects rather than blindly
 * treating every propagated parent severity as a distinct high advisory.
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
        "No patched picomatch npm release exists as of 2026-11-18. Re-review upstream before expiry; every other high/critical root advisory remains blocking.",
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

function rootAdvisories(name, seen = new Set()) {
  if (seen.has(name)) return new Map();
  seen.add(name);
  const roots = new Map();
  const info = vulns[name];

  for (const via of info?.via || []) {
    if (via && typeof via === "object" && typeof via.source === "number") {
      roots.set(via.source, {
        source: via.source,
        name: via.name,
        title: via.title,
        severity: via.severity,
        url: via.url,
        range: via.range,
      });
    } else if (typeof via === "string" && vulns[via]) {
      for (const [source, advisory] of rootAdvisories(via, seen)) {
        roots.set(source, advisory);
      }
    }
  }
  return roots;
}

function waiverActive(source) {
  const waiver = TEMPORARY_WAIVERS.get(source);
  if (!waiver) return false;
  return Date.now() < Date.parse(waiver.expires);
}

const blockers = [];
const waived = [];

for (const [name, info] of Object.entries(vulns)) {
  if (info.severity !== "high" && info.severity !== "critical") continue;

  const roots = [...rootAdvisories(name).values()];
  if (!roots.length) {
    blockers.push({ name, severity: info.severity, reason: "high/critical finding without resolvable root advisory", via: info.via });
    continue;
  }

  const highRoots = roots.filter((root) => root.severity === "high" || root.severity === "critical");
  const unwaivedHighRoots = highRoots.filter(
    (root) => root.severity === "critical" || !waiverActive(root.source)
  );

  if (unwaivedHighRoots.length) {
    blockers.push({ name, severity: info.severity, rootAdvisories: unwaivedHighRoots });
    continue;
  }

  if (highRoots.length) {
    waived.push({ name, severity: info.severity, rootAdvisories: highRoots });
  }
}

if (waived.length) {
  console.warn("Temporary dependency-audit waiver applied:");
  console.warn(JSON.stringify(waived, null, 2));
  for (const [source, waiver] of TEMPORARY_WAIVERS) {
    if (waived.some((item) => item.rootAdvisories.some((root) => root.source === source))) {
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

console.log("Dependency audit OK (no unwaived high/critical root advisories)");
