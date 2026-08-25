import fs from "fs";
import path from "path";
import { loadMdbBookMaps } from "@/lib/mdb-boundaries";
import { layoutPinsInPixels } from "@/lib/pin-layout";
import type { CapitalPin } from "@/lib/nc-capitals";

type LngLat = [number, number];
type GeoBox = { west: number; east: number; south: number; north: number };
type Geom = { type: string; coordinates: unknown };

type MunSheet = {
  name: string;
  fill: string;
  geometry: Geom;
  centroid?: { lng: number; lat: number };
};

type DistrictSheet = {
  code: string;
  name: string;
  color: string;
  geometry: Geom;
  municipalities: MunSheet[];
};

function ringsOf(geom: Geom): LngLat[][] {
  if (geom.type === "Polygon") {
    return (geom.coordinates as number[][][]).map((r) => r.map((c) => [c[0], c[1]] as LngLat));
  }
  if (geom.type !== "MultiPolygon") return [];
  const multi = geom.coordinates as number[][][][];
  return multi.flatMap((poly) => poly.map((r) => r.map((c) => [c[0], c[1]] as LngLat)));
}

function bboxOfGeom(geom: Geom): GeoBox {
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (const ring of ringsOf(geom)) {
    for (const [lng, lat] of ring) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return { west, east, south, north };
}

function centroidOfGeom(geom: Geom): { lng: number; lat: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const ring of ringsOf(geom)) {
    for (const [lng, lat] of ring) {
      sx += lng;
      sy += lat;
      n += 1;
    }
  }
  if (!n) return null;
  return { lng: sx / n, lat: sy / n };
}

function unionBoxes(boxes: GeoBox[]): GeoBox {
  return boxes.reduce(
    (acc, b) => ({
      west: Math.min(acc.west, b.west),
      east: Math.max(acc.east, b.east),
      south: Math.min(acc.south, b.south),
      north: Math.max(acc.north, b.north),
    }),
    { west: 180, east: -180, south: 90, north: -90 }
  );
}

function makeProjector(geo: GeoBox, width: number, height: number, pad = 36) {
  const { west, east, south, north } = geo;
  const spanLng = Math.max(east - west, 0.05);
  const spanLat = Math.max(north - south, 0.05);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const midLat = (south + north) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = spanLng * lonScale;
  const scale = Math.min(innerW / spanX, innerH / spanLat);

  const project = (lng: number, lat: number) => {
    const x = pad + (lng - west) * lonScale * scale + (innerW - spanX * scale) / 2;
    const y = pad + (north - lat) * scale + (innerH - spanLat * scale) / 2;
    return { x, y };
  };

  const pathFromGeom = (geom: Geom) =>
    ringsOf(geom)
      .map((ring) => {
        if (!ring.length) return "";
        return (
          ring
            .map((pt, i) => {
              const { x, y } = project(pt[0], pt[1]);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ") + " Z"
        );
      })
      .join(" ");

  return { project, pathFromGeom };
}

function readFc(rel: string): GeoJSON.FeatureCollection | null {
  try {
    const p = path.join(process.cwd(), rel);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as GeoJSON.FeatureCollection;
  } catch {
    return null;
  }
}

function loadSheets(): { districts: DistrictSheet[]; attribution: string } | null {
  const mdb = loadMdbBookMaps();
  if (mdb && Object.keys(mdb.districts).length) {
    return {
      districts: Object.values(mdb.districts).map((d) => ({
        code: d.code,
        name: d.name,
        color: d.color,
        geometry: d.geometry as Geom,
        municipalities: (d.municipalities || []).map((m) => ({
          name: m.name,
          fill: m.fill || d.color,
          geometry: m.geometry as Geom,
          centroid: m.centroid,
        })),
      })),
      attribution:
        mdb.attribution ||
        "Municipal Demarcation Board (MDB) 2018 · colours match municipalities.co.za",
    };
  }

  const distFc = readFc("data/boundaries/nc_districts.geojson");
  const munFc = readFc("data/boundaries/nc_municipalities.geojson");
  if (!distFc?.features.length) return null;

  const districts: DistrictSheet[] = distFc.features.map((f) => {
    const props = (f.properties || {}) as { name?: string; code?: string; fill?: string };
    const code = props.code || props.name || "unknown";
    const color = props.fill || "#94a3b8";
    const muns = (munFc?.features || [])
      .filter((m) => String((m.properties as { districtCode?: string } | null)?.districtCode) === code)
      .map((m) => {
        const mp = (m.properties || {}) as { name?: string; fill?: string };
        const geom = m.geometry as Geom;
        return {
          name: mp.name || "Municipality",
          fill: mp.fill || color,
          geometry: geom,
          centroid: centroidOfGeom(geom) || undefined,
        };
      });
    return {
      code,
      name: props.name || code,
      color,
      geometry: f.geometry as Geom,
      municipalities: muns,
    };
  });

  return {
    districts,
    attribution:
      "Northern Cape district envelopes · colours match municipalities.co.za",
  };
}

function labelOffset(slug: string): { dx: number; dy: number; anchor: "start" | "end" } {
  switch (slug) {
    case "kimberley":
      return { dx: -20, dy: -18, anchor: "end" };
    case "kuruman":
      return { dx: 22, dy: -20, anchor: "start" };
    case "kathu":
      return { dx: -20, dy: 28, anchor: "end" };
    case "upington":
      return { dx: 22, dy: -20, anchor: "start" };
    case "springbok":
      return { dx: 22, dy: -18, anchor: "start" };
    default:
      return { dx: 22, dy: -12, anchor: "start" };
  }
}

/**
 * Province-wide district map with capital-city pins for the book overview.
 */
export function ProvinceOverviewMap({ pins }: { pins: CapitalPin[] }) {
  const pack = loadSheets();

  if (!pack) {
    return (
      <figure className="official-admin-map">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/maps/nc-district-municipalities-official.png"
          alt="Northern Cape district and local municipalities map — Frances Baard, John Taolo Gaetsewe, Namakwa, Pixley ka Seme, ZF Mgcawu"
          className="official-admin-map-img"
        />
        <figcaption>
          District polygons unavailable — showing the official municipalities.co.za sheet without
          georeferenced pins.
        </figcaption>
      </figure>
    );
  }

  const { districts, attribution } = pack;
  const geo = unionBoxes(districts.map((d) => bboxOfGeom(d.geometry)));
  const dispW = 900;
  const ratio = (geo.east - geo.west) / Math.max(geo.north - geo.south, 0.05);
  const dispH = Math.round(Math.min(720, Math.max(500, dispW / Math.max(ratio * 0.9, 0.7))));
  const pad = 48;
  const { project, pathFromGeom } = makeProjector(geo, dispW, dispH, pad);

  const pinR = 22;
  const placed = layoutPinsInPixels(pins, project, {
    minSepPx: 64,
    padPx: pad + 6,
    width: dispW,
    height: dispH,
  });

  return (
    <figure className="district-pin-map mdb-district-sheet province-overview-map">
      <figcaption className="district-pin-map-cap">
        Northern Cape district municipalities
        <span> — capital-city pins · colours match municipalities.co.za</span>
      </figcaption>

      <div className="district-zoom-badge" style={{ borderColor: "#0f172a", color: "#0f172a" }}>
        {pins.length} capital-city pins · Kimberley, Kuruman, Kathu, Upington, Springbok
      </div>

      <svg
        className="district-pin-svg mdb-sheet-svg"
        viewBox={`0 0 ${dispW} ${dispH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Northern Cape districts with capital city pins for Kimberley, Kuruman, Kathu, Upington and Springbok"
      >
        <defs>
          <filter id="capitalPinShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.4" stdDeviation="1.3" floodOpacity="0.35" />
          </filter>
        </defs>

        <rect x={0} y={0} width={dispW} height={dispH} fill="#f7f8f6" />

        {districts.flatMap((d) =>
          (d.municipalities.length ? d.municipalities : [{ name: d.name, fill: d.color, geometry: d.geometry }]).map(
            (m) => (
              <path
                key={`mun-${d.code}-${m.name}`}
                d={pathFromGeom(m.geometry)}
                fill={m.fill}
                stroke="#1e293b"
                strokeWidth={0.7}
                strokeLinejoin="round"
              />
            )
          )
        )}

        {districts.map((d) => (
          <path
            key={`dist-${d.code}`}
            d={pathFromGeom(d.geometry)}
            fill={d.municipalities.length ? "none" : d.color}
            stroke="#0f172a"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        ))}

        {districts.map((d) => {
          const c = centroidOfGeom(d.geometry);
          if (!c) return null;
          const { x, y } = project(c.lng, c.lat);
          return (
            <text
              key={`dlab-${d.code}`}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={11}
              fontWeight={800}
              fill="#0f172a"
              opacity={0.5}
              style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
            >
              {d.name}
            </text>
          );
        })}

        {placed.map((p) =>
          p.wasSpread ? (
            <line
              key={`spread-${p.n}`}
              x1={p.originX}
              y1={p.originY}
              x2={p.x}
              y2={p.y}
              stroke={p.color}
              strokeWidth={1.3}
              strokeOpacity={0.5}
            />
          ) : null
        )}

        {placed.map((p) => {
          const { x, y } = p;
          const r = pinR;
          const off = labelOffset(p.slug);
          const lx = x + off.dx;
          const ly = y + off.dy;
          return (
            <g key={`pin-${p.n}`} filter="url(#capitalPinShadow)">
              <path
                d={`M ${x} ${y + r + 2} C ${x - r} ${y + 2}, ${x - r} ${y - r}, ${x} ${y - r - 4} C ${x + r} ${y - r}, ${x + r} ${y + 2}, ${x} ${y + r + 2} Z`}
                fill={p.color}
                stroke="#fff"
                strokeWidth={3}
              />
              <circle cx={x} cy={y - r * 0.35} r={r * 0.88} fill="#0f172a" />
              <text
                x={x}
                y={y - r * 0.12}
                textAnchor="middle"
                fontSize={r * 0.95}
                fontWeight={800}
                fill="#fff"
              >
                {p.n}
              </text>
              <text
                x={lx}
                y={ly}
                textAnchor={off.anchor}
                fontSize={18}
                fontWeight={800}
                fill="#0f172a"
                stroke="#fff"
                strokeWidth={4}
                paintOrder="stroke"
                style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>

      <ol className="district-pin-legend legend-card capital-city-legend">
        {pins.map((p) => (
          <li key={p.slug}>
            <span className="pin-n" style={{ background: p.color }}>
              {p.n}
            </span>
            <span>
              <strong>{p.name}</strong>
              <em>
                {" "}
                · {p.role} · {p.district}
              </em>
              <span className="pin-coord">
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="meta" style={{ marginTop: 4 }}>
        {attribution}
      </p>
    </figure>
  );
}
