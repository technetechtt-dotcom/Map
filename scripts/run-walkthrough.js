const { spawn } = require("child_process");
const fs = require("fs");

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].replace(/^"|"$/g, "");
}

const child = spawn(
  "npx",
  ["playwright", "test", "tests/e2e/demo-walkthrough.spec.ts", "--project=chromium"],
  { stdio: "inherit", shell: true, env: process.env }
);
child.on("exit", (code) => process.exit(code || 0));
