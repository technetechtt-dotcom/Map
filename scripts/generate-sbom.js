const { execFileSync } = require("child_process");
const { writeFileSync } = require("fs");

const output = execFileSync("npm", ["sbom", "--sbom-format", "cyclonedx"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
JSON.parse(output);
writeFileSync("sbom.cdx.json", output);
console.log("Wrote sbom.cdx.json");
