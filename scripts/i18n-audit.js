#!/usr/bin/env node
/** Flag likely untranslated UI strings in src/components and src/app. */
const { readFileSync, readdirSync, statSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..", "src");
const EXT = [".tsx", ".ts"];
const IGNORE = /^(api|lib|middleware|instrumentation)/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const issues = [];
for (const file of walk(ROOT)) {
  if (IGNORE.test(file.replace(/\\/g, "/"))) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/>\s*[A-Z][a-zA-Z ,/&'-]{8,}\s*</.test(line) && !line.includes("t(") && !line.includes("className")) {
      issues.push({ file, line: i + 1, snippet: line.trim().slice(0, 120) });
    }
  });
}

console.log(JSON.stringify({ ok: issues.length === 0, untranslatedCandidates: issues.length, sample: issues.slice(0, 30) }, null, 2));
process.exit(issues.length > 50 ? 1 : 0);
