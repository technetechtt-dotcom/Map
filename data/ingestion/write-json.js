const fs = require("fs");
const path = require("path");
const { connectors } = require("./public-directory");

for (const [id, payload] of Object.entries(connectors)) {
  const file = path.join(__dirname, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  const count = Array.isArray(payload) ? payload.length : (payload.records || []).length;
  console.log(`${id}\t${count}`);
}
