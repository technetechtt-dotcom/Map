#!/usr/bin/env node
/**
 * scripts/reconcile-catalogue-counts.js
 *
 * Programmatically computes exact catalog counts from seed and ingestion sources,
 * checks documentation for alignment, and optionally reconciles/updates them.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function calculateDatasetCounts() {
  const { locations } = require(path.join(ROOT, "data/seed/nc-locations.js"));
  const { organisations: pdfOrganisations } = require(path.join(ROOT, "data/seed/pdf-organisations.js"));
  const { records: nationalDirectory } = require(path.join(ROOT, "data/seed/national-directory.js"));
  const { connectors: nationalConnectors } = require(path.join(ROOT, "data/ingestion/public-directory.js"));

  const names = new Set(locations.map((l) => l[1].toLowerCase()));
  let seededFromNationalDir = 0;
  for (const r of nationalDirectory) {
    if (!names.has(r.name.toLowerCase())) {
      names.add(r.name.toLowerCase());
      seededFromNationalDir++;
    }
  }

  let seededFromConnectors = 0;
  for (const [, payload] of Object.entries(nationalConnectors)) {
    const rows = Array.isArray(payload) ? payload : payload.records || [];
    for (const r of rows) {
      if (r.name && r.latitude != null && r.longitude != null) {
        if (!names.has(r.name.toLowerCase())) {
          names.add(r.name.toLowerCase());
          seededFromConnectors++;
        }
      }
    }
  }

  const ncTownCount = locations.length;
  const pdfOrgCount = pdfOrganisations.length;
  const baseNationalDirCount = nationalDirectory.length;
  const totalPublicDirectoryPins = seededFromNationalDir + seededFromConnectors;
  const totalSeedLocations = ncTownCount + totalPublicDirectoryPins;

  return {
    ncTownCount,
    pdfOrgCount,
    baseNationalDirCount,
    connectorPinsCount: seededFromConnectors,
    totalPublicDirectoryPins,
    totalSeedLocations,
  };
}

function reconcileDoc(filePath, replacers) {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, "utf8");
  let modified = false;
  for (const { search, replace } of replacers) {
    if (content.match(search)) {
      content = content.replace(search, replace);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(fullPath, content, "utf8");
    console.log(`Reconciled: ${filePath}`);
  }
}

function main() {
  const counts = calculateDatasetCounts();
  console.log("Computed catalogue counts directly from dataset:");
  console.log(`- Curated Northern Cape towns: ${counts.ncTownCount}`);
  console.log(`- PDF organisations: ${counts.pdfOrgCount}`);
  console.log(`- Base national directory pins: ${counts.baseNationalDirCount}`);
  console.log(`- Ingested connector directory pins: ${counts.connectorPinsCount}`);
  console.log(`- Total national public-directory pins: ${counts.totalPublicDirectoryPins}`);
  console.log(`- Total seed locations: ${counts.totalSeedLocations}`);

  const update = process.argv.includes("--update") || process.argv.includes("-u");

  if (update) {
    // Reconcile docs/data-quality.md
    reconcileDoc("docs/data-quality.md", [
      {
        search: /Primary published locations are \*\*\d+\*\* Northern Cape presentation towns \(desktop-verified\) plus \*\*\d+\*\* national directory pins\./g,
        replace: `Primary published locations are **${counts.ncTownCount}** Northern Cape presentation towns (desktop-verified) plus **${counts.totalPublicDirectoryPins}** national directory pins (${counts.baseNationalDirCount} core directory scaffold + ${counts.connectorPinsCount} connector pins).`,
      },
      {
        search: /\*\*\d+\*\* PDF organisations sit in the directory\./g,
        replace: `**${counts.pdfOrgCount}** PDF organisations sit in the directory.`,
      },
    ]);

    // Reconcile docs/one-pager.md
    reconcileDoc("docs/one-pager.md", [
      {
        search: /\| National public-directory pins \| \d+ \|/g,
        replace: `| National public-directory pins | ${counts.totalPublicDirectoryPins} |`,
      },
    ]);

    // Reconcile docs/demo-script.md
    reconcileDoc("docs/demo-script.md", [
      {
        search: /Live seed is \*\*\d+ NC towns \+ \d+ organisations \+ \d+ national public-directory pins\*\*/g,
        replace: `Live seed is **${counts.ncTownCount} NC towns + ${counts.pdfOrgCount} organisations + ${counts.totalPublicDirectoryPins} national public-directory pins**`,
      },
    ]);

    // Reconcile README.md
    reconcileDoc("README.md", [
      {
        search: /Live seed is \*\*\d+ NC towns \+ \d+ organisations \+ \d+ national public-directory pins\*\*/g,
        replace: `Live seed is **${counts.ncTownCount} NC towns + ${counts.pdfOrgCount} organisations + ${counts.totalPublicDirectoryPins} national public-directory pins**`,
      },
    ]);
  }

  // Validate consistency across docs
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const readme = read("README.md");
  const dataQuality = read("docs/data-quality.md");
  const onePager = read("docs/one-pager.md");
  const demoScript = read("docs/demo-script.md");

  const expectedStr = `${counts.totalPublicDirectoryPins} national`;
  let errors = [];
  if (!readme.includes(`${counts.totalPublicDirectoryPins} national public-directory pins`)) {
    errors.push(`README.md does not match ${counts.totalPublicDirectoryPins} national public-directory pins`);
  }
  if (!dataQuality.includes(`${counts.totalPublicDirectoryPins}** national directory pins`)) {
    errors.push(`docs/data-quality.md does not match ${counts.totalPublicDirectoryPins} national directory pins`);
  }
  if (!onePager.includes(`| National public-directory pins | ${counts.totalPublicDirectoryPins} |`)) {
    errors.push(`docs/one-pager.md does not match ${counts.totalPublicDirectoryPins}`);
  }
  if (!demoScript.includes(`${counts.totalPublicDirectoryPins} national public-directory pins`)) {
    errors.push(`docs/demo-script.md does not match ${counts.totalPublicDirectoryPins} national public-directory pins`);
  }

  if (errors.length > 0) {
    if (!update) {
      console.error("\nDiscrepancies found across documentation:");
      errors.forEach((e) => console.error(`  - ${e}`));
      console.error("\nRun `node scripts/reconcile-catalogue-counts.js --update` to reconcile.");
      process.exit(1);
    }
  } else {
    console.log("\nAll catalogue documentation is verified and consistent with live dataset!");
  }
}

main();
