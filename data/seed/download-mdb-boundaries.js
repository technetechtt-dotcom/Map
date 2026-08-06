/**
 * Download Northern Cape district + local municipality polygons (MDB 2018)
 * from DPME ArcGIS FeatureServer for accurate book maps.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "boundaries", "mdb");
const BASE =
  "https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer";

const WHERE =
  "districtmunicipality IN ('Frances Baard','John Taolo Gaetsewe','Namakwa','Pixley ka Seme','Z F Mgcawu')";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function downloadLayer(layerId, filename) {
  const where = encodeURIComponent(WHERE);
  const url = `${BASE}/${layerId}/query?where=${where}&outFields=*&outSR=4326&f=geojson`;
  console.log(`GET layer ${layerId}…`);
  const text = await fetchText(url);
  const json = JSON.parse(text);
  if (!json.features || !json.features.length) {
    throw new Error(`No features in ${filename}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(json));
  console.log(`  ${filename}: ${json.features.length} features`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await downloadLayer(0, "nc_districts_raw.geojson");
  await downloadLayer(1, "nc_local_mun_raw.geojson");
  console.log("Done. Run: node data/seed/build-mdb-maps.js");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
