/**
 * Build book-ready Northern Cape district/municipality maps from MDB 2018
 * polygons (downloaded via data/seed/download-mdb-boundaries.js).
 *
 * These are cadastral-accurate district sheets — not rectangular crops of the
 * low-res municipalities.co.za PNG (that raster is kept only for overview art).
 *
 * Colours match the municipalities.co.za district palette used elsewhere.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const IN_DIR = path.join(ROOT, "data", "boundaries", "mdb");
const OUT = path.join(IN_DIR, "nc_mdb_book.json");

const DISTRICT_META = {
  "Frances Baard": {
    code: "DC9",
    slug: "frances-baard",
    color: "#C9B3E0",
    displayName: "Frances Baard",
  },
  "John Taolo Gaetsewe": {
    code: "DC45",
    slug: "john-taolo-gaetsewe",
    color: "#8EC4E8",
    displayName: "John Taolo Gaetsewe",
  },
  Namakwa: {
    code: "DC6",
    slug: "namakwa",
    color: "#E8C84A",
    displayName: "Namakwa",
  },
  "Pixley ka Seme": {
    code: "DC7",
    slug: "pixley-ka-seme",
    color: "#A8D08D",
    displayName: "Pixley ka Seme",
  },
  "Z F Mgcawu": {
    code: "DC8",
    slug: "zf-mgcawu",
    color: "#7A9EAD",
    displayName: "ZF Mgcawu",
  },
};

/** Lighten / darken a hex fill for local municipalities inside a district */
function munFill(hex, i, n) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const t = n <= 1 ? 0 : (i / (n - 1) - 0.5) * 0.22;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + t * 255)));
  return `#${[f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.sqrt(dist2(p, a));
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  return Math.sqrt(dist2(p, [a[0] + tt * dx, a[1] + tt * dy]));
}

/** Ramer–Douglas–Peucker (ring must be closed or open; keep endpoints) */
function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const tol2 = tolerance; // distance in degrees

  function rdp(pts) {
    if (pts.length <= 2) return pts;
    let maxD = 0;
    let idx = 0;
    const end = pts.length - 1;
    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(pts[i], pts[0], pts[end]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2) {
      const left = rdp(pts.slice(0, idx + 1));
      const right = rdp(pts.slice(idx));
      return left.slice(0, -1).concat(right);
    }
    return [pts[0], pts[end]];
  }

  // drop closing duplicate for RDP then re-close
  let open = points;
  if (
    open.length > 1 &&
    open[0][0] === open[open.length - 1][0] &&
    open[0][1] === open[open.length - 1][1]
  ) {
    open = open.slice(0, -1);
  }
  let simp = rdp(open);
  if (simp.length < 3) simp = open.slice(0, Math.min(open.length, 12));
  simp = simp.concat([[simp[0][0], simp[0][1]]]);
  return simp.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]);
}

function simplifyGeometry(geom, tolerance) {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geom.coordinates.map((ring) => simplifyRing(ring, tolerance)),
    };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) =>
        poly.map((ring) => simplifyRing(ring, tolerance))
      ),
    };
  }
  return geom;
}

function allCoords(geom, out = []) {
  if (!geom) return out;
  if (typeof geom[0] === "number") {
    out.push(geom);
    return out;
  }
  for (const c of geom) allCoords(c, out);
  return out;
}

function bboxOfGeom(geom) {
  const pts = allCoords(geom.coordinates);
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return { west: minLng, east: maxLng, south: minLat, north: maxLat };
}

/** Area-weighted centroid of outer rings (degrees) */
function centroidOfGeom(geom) {
  const rings =
    geom.type === "Polygon"
      ? [geom.coordinates[0]]
      : geom.coordinates.map((p) => p[0]);

  let aSum = 0;
  let cx = 0;
  let cy = 0;
  for (const ring of rings) {
    let a = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const c = x0 * y1 - x1 * y0;
      a += c;
      x += (x0 + x1) * c;
      y += (y0 + y1) * c;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-12) continue;
    cx += x / (6 * a) * Math.abs(a);
    cy += y / (6 * a) * Math.abs(a);
    aSum += Math.abs(a);
  }
  if (aSum < 1e-12) {
    const pts = allCoords(geom.coordinates);
    const n = pts.length || 1;
    return {
      lng: pts.reduce((s, p) => s + p[0], 0) / n,
      lat: pts.reduce((s, p) => s + p[1], 0) / n,
    };
  }
  return { lng: cx / aSum, lat: cy / aSum };
}

function labelName(name) {
  return String(name || "")
    .replace(/KhA.i-Ma/i, "KHÂI-MA")
    .replace(/Khâi-Ma/i, "KHÂI-MA")
    .toUpperCase();
}

function main() {
  const distPath = path.join(IN_DIR, "nc_districts_raw.geojson");
  const munPath = path.join(IN_DIR, "nc_local_mun_raw.geojson");
  if (!fs.existsSync(distPath) || !fs.existsSync(munPath)) {
    console.error("Missing raw MDB GeoJSON. Run: node data/seed/download-mdb-boundaries.js");
    process.exit(1);
  }

  const districts = JSON.parse(fs.readFileSync(distPath, "utf8"));
  const muns = JSON.parse(fs.readFileSync(munPath, "utf8"));

  // Slightly coarser tolerance for large coastal Namakwa, finer for small FB
  const TOL = {
    DC9: 0.0025,
    DC45: 0.003,
    DC6: 0.006,
    DC7: 0.004,
    DC8: 0.004,
  };

  /** @type {Record<string, any>} */
  const byCode = {};

  for (const f of districts.features) {
    const key = f.properties.districtmunicipality;
    const meta = DISTRICT_META[key];
    if (!meta) {
      console.warn("skip district", key);
      continue;
    }
    const tol = TOL[meta.code] || 0.004;
    const geom = simplifyGeometry(f.geometry, tol);
    const bbox = bboxOfGeom(geom);
    byCode[meta.code] = {
      code: meta.code,
      slug: meta.slug,
      name: meta.displayName,
      mdbName: key,
      color: meta.color,
      geo: bbox,
      geometry: geom,
      municipalities: [],
      source: "Municipal Demarcation Board (MDB 2018) via DPME Administrative Geospatial Areas",
    };
  }

  // group muns
  const groups = {};
  for (const f of muns.features) {
    const dKey = f.properties.districtmunicipality;
    const meta = DISTRICT_META[dKey];
    if (!meta) continue;
    if (!groups[meta.code]) groups[meta.code] = [];
    groups[meta.code].push(f);
  }

  for (const [code, list] of Object.entries(groups)) {
    const sheet = byCode[code];
    if (!sheet) continue;
    list.sort((a, b) =>
      String(a.properties.localmunicipality).localeCompare(String(b.properties.localmunicipality))
    );
    const tol = TOL[code] || 0.004;
    sheet.municipalities = list.map((f, i) => {
      const geom = simplifyGeometry(f.geometry, tol * 0.85);
      const c = centroidOfGeom(geom);
      const rawName = f.properties.localmunicipality;
      return {
        name: rawName,
        label: labelName(rawName),
        fill: munFill(sheet.color, i, list.length),
        geometry: geom,
        centroid: { lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5) },
      };
    });
  }

  // expand geo slightly for padding context
  for (const sheet of Object.values(byCode)) {
    const padLng = (sheet.geo.east - sheet.geo.west) * 0.04;
    const padLat = (sheet.geo.north - sheet.geo.south) * 0.04;
    sheet.geo = {
      west: sheet.geo.west - padLng,
      east: sheet.geo.east + padLng,
      south: sheet.geo.south - padLat,
      north: sheet.geo.north + padLat,
    };
  }

  const out = {
    attribution:
      "Boundaries: Municipal Demarcation Board (MDB) 2018. Colours match municipalities.co.za district palette.",
    districts: byCode,
  };

  fs.writeFileSync(OUT, JSON.stringify(out));
  const bytes = fs.statSync(OUT).size;
  console.log(
    `Wrote ${OUT} (${(bytes / 1024).toFixed(0)} KB) with ${Object.keys(byCode).length} districts`
  );
  for (const s of Object.values(byCode)) {
    console.log(`  ${s.code} ${s.name}: ${s.municipalities.length} muns`);
  }
}

main();
