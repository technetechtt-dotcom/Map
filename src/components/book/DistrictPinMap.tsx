import fs from "fs";
import path from "path";
import { layoutAlignedPinLabels, layoutPinsInPixels } from "@/lib/pin-layout";

export type MapPin = {
  n: number;
  name: string;
  short: string;
  latitude: number;
  longitude: number;
  type?: string | null;
  address?: string | null;
  pinProxy?: boolean;
};

type LngLat = [number, number];

type SheetMun = {
  name: string;
  label: string;
  fill: string;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  centroid: { lng: number; lat: number };
};

type DistrictSheet = {
  code: string;
  slug: string;
  name: string;
  color: string;
  geo: { west: number; east: number; south: number; north: number };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  municipalities: SheetMun[];
  source?: string;
};

type BookMaps = {
  attribution: string;
  districts: Record<string, DistrictSheet>;
};

function loadBookMaps(): BookMaps | null {
  try {
    const p = path.join(process.cwd(), "data", "boundaries", "mdb", "nc_mdb_book.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as BookMaps;
  } catch {
    return null;
  }
}

function shortName(name: string) {
  return name
    .replace(/Northern Cape /gi, "NC ")
    .replace(/ — .*$/, "")
    .replace(/ \(.*\)$/, "")
    .slice(0, 22);
}

function ringsOf(geom: { type: string; coordinates: unknown }): LngLat[][] {
  if (geom.type === "Polygon") {
    return (geom.coordinates as number[][][]).map((r) => r.map((c) => [c[0], c[1]] as LngLat));
  }
  const multi = geom.coordinates as number[][][][];
  return multi.flatMap((poly) => poly.map((r) => r.map((c) => [c[0], c[1]] as LngLat)));
}

function makeProjector(
  geo: DistrictSheet["geo"],
  width: number,
  height: number,
  pad = 22
) {
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

  const pathFromGeom = (geom: { type: string; coordinates: unknown }) =>
    ringsOf(geom as { type: string; coordinates: unknown })
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

  return { project, pathFromGeom, width, height };
}

type Props = {
  title: string;
  districtCode: string;
  accent: string;
  pins: MapPin[];
  townMarkers?: { name: string; latitude: number; longitude: number }[];
  highlightMunNames?: string[];
};

/**
 * Book district map: MDB polygons + fully spaced, numbered key-contact pins
 * with aligned callout names so every PDF contact is readable.
 */
export function DistrictPinMap({
  districtCode,
  accent,
  pins,
  townMarkers = [],
  highlightMunNames = [],
}: Props) {
  const book = loadBookMaps();
  const sheet = book?.districts[districtCode];

  if (!sheet) {
    return (
      <figure className="district-pin-map">
        <p className="meta">
          Accurate MDB district map missing. Run: <code>npm run maps:mdb</code>
        </p>
      </figure>
    );
  }

  const ratio = (sheet.geo.east - sheet.geo.west) / (sheet.geo.north - sheet.geo.south);
  const dispW = 820;
  const dispH = Math.round(Math.min(640, Math.max(360, dispW / Math.max(ratio * 0.85, 0.55))));
  const mapPad = pins.length >= 4 ? 48 : 28;
  const { project, pathFromGeom } = makeProjector(sheet.geo, dispW, dispH, mapPad);

  const pinR = 12;
  const minSep = Math.max(44, Math.min(58, 30 + pins.length * 3.5));
  const placed = layoutPinsInPixels(pins, project, {
    minSepPx: minSep,
    padPx: mapPad + 8,
    width: dispW,
    height: dispH,
  });

  const nameLabels = layoutAlignedPinLabels(
    placed.map((p) => ({ n: p.n, short: p.short, x: p.x, y: p.y })),
    { width: dispW, height: dispH, pinRadius: pinR, pad: 10 }
  );

  const accentUse = accent || sheet.color;
  const gid = sheet.slug;
  const hi = new Set(highlightMunNames.map((n) => n.toLowerCase()));
  const labelFs = Math.max(10, Math.min(13, dispW * 0.015));

  return (
    <figure className="district-pin-map mdb-district-sheet">
      <figcaption className="district-pin-map-cap">
        {sheet.name} District Municipality
        <span> — MDB boundaries · spaced pins · aligned names</span>
      </figcaption>

      <div className="district-zoom-badge" style={{ borderColor: accentUse, color: accentUse }}>
        {pins.length} key-contact pin{pins.length === 1 ? "" : "s"} · numbers match list below
      </div>

      <svg
        className="district-pin-svg mdb-sheet-svg"
        viewBox={`0 0 ${dispW} ${dispH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${sheet.name} district with organisation pins`}
      >
        <defs>
          <filter id={`pinShadow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodOpacity="0.35" />
          </filter>
        </defs>

        <rect x={0} y={0} width={dispW} height={dispH} fill="#f7f8f6" />

        {sheet.municipalities.map((m) => {
          const d = pathFromGeom(m.geometry);
          const isHi = hi.has(m.name.toLowerCase());
          return (
            <path
              key={`mun-${m.name}`}
              d={d}
              fill={m.fill}
              stroke={isHi ? accentUse : "#1e293b"}
              strokeWidth={isHi ? 2.4 : 1.1}
              strokeLinejoin="round"
            />
          );
        })}

        <path
          d={pathFromGeom(sheet.geometry)}
          fill="none"
          stroke="#0f172a"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />

        {sheet.municipalities.map((m) => {
          const { x, y } = project(m.centroid.lng, m.centroid.lat);
          const w = Math.max(64, m.label.length * labelFs * 0.58);
          const h = labelFs + 7;
          return (
            <g key={`lb-${m.name}`} opacity={0.92}>
              <rect
                x={x - w / 2}
                y={y - h / 2}
                width={w}
                height={h}
                rx={2}
                fill="rgba(255,255,255,0.82)"
                stroke="none"
              />
              <text
                x={x}
                y={y + labelFs * 0.32}
                textAnchor="middle"
                fontSize={labelFs}
                fontWeight={700}
                fill="#0f172a"
                letterSpacing="0.03em"
                style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {townMarkers.map((t) => {
          const { x, y } = project(t.longitude, t.latitude);
          return (
            <g key={`town-${t.name}`}>
              <circle cx={x} cy={y} r={5} fill="#fff" stroke={accentUse} strokeWidth={2} />
              <text
                x={x + 9}
                y={y - 9}
                fontSize={13}
                fontWeight={800}
                fill="#0f172a"
                style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
              >
                {t.name}
              </text>
            </g>
          );
        })}

        {placed.map((p) => {
          if (!p.wasSpread) return null;
          return (
            <line
              key={`leg-${p.n}`}
              x1={p.originX}
              y1={p.originY}
              x2={p.x}
              y2={p.y}
              stroke={accentUse}
              strokeWidth={1.4}
              strokeOpacity={0.45}
            />
          );
        })}

        {nameLabels.map((lb) => {
          const midX = lb.boxX > lb.pinX ? lb.boxX - 2 : lb.boxX + lb.boxW + 2;
          return (
            <path
              key={`nl-${lb.n}`}
              d={`M ${lb.pinX} ${lb.pinY} L ${midX} ${lb.boxY + lb.boxH / 2}`}
              fill="none"
              stroke="#475569"
              strokeWidth={1.1}
              strokeOpacity={0.55}
            />
          );
        })}

        {placed.map((p) => {
          const { x, y } = p;
          const r = pinR;
          return (
            <g key={`pin-${p.n}`} filter={`url(#pinShadow-${gid})`}>
              <path
                d={`M ${x} ${y + r + 2} C ${x - r} ${y + 2}, ${x - r} ${y - r}, ${x} ${y - r - 4} C ${x + r} ${y - r}, ${x + r} ${y + 2}, ${x} ${y + r + 2} Z`}
                fill={accentUse}
                stroke="#fff"
                strokeWidth={2.2}
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
            </g>
          );
        })}

        {nameLabels.map((lb) => (
          <g key={`name-${lb.n}`}>
            <rect
              x={lb.boxX}
              y={lb.boxY}
              width={lb.boxW}
              height={lb.boxH}
              rx={3}
              fill="rgba(255,255,255,0.96)"
              stroke="none"
            />
            <text
              x={lb.boxX + 5}
              y={lb.boxY + lb.boxH * 0.72}
              fontSize={10.5}
              fontWeight={700}
              fill="#0f172a"
              style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
            >
              <tspan fill={accentUse} fontWeight={800}>
                {lb.n}.{" "}
              </tspan>
              {lb.text}
            </text>
          </g>
        ))}
      </svg>

      <p className="district-pin-help">
        Contact names are stacked in one aligned column (left or right of the cluster) so every PDF
        key contact stays readable. Lines link each name to its numbered pin.
      </p>
      <p className="meta" style={{ marginTop: 4 }}>
        {book?.attribution}
      </p>

      <ol className="district-pin-legend legend-card">
        {pins.map((p) => (
          <li key={`leg-${p.n}`}>
            <span className="pin-n" style={{ background: accentUse }}>
              {p.n}
            </span>
            <span>
              <strong>{p.name}</strong>
              {p.type ? <em> · {p.type}</em> : null}
              {p.pinProxy ? <em> · zone marker (HQ outside district)</em> : null}
              {p.address ? <span className="pin-addr">{p.address}</span> : null}
              <span className="pin-coord">
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function buildPinsFromOrgs(
  contacts: {
    name: string;
    slug: string;
    type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    pinNumber?: number | null;
    pinProxy?: boolean | null;
  }[]
): MapPin[] {
  return contacts
    .filter((o) => o.latitude != null && o.longitude != null && o.pinNumber != null)
    .map((o) => ({
      n: o.pinNumber as number,
      name: o.name,
      short: shortName(o.name),
      latitude: o.latitude as number,
      longitude: o.longitude as number,
      type: o.type,
      address: o.address,
      pinProxy: Boolean(o.pinProxy),
    }));
}

export function primaryDistrictCode(codes: string[]): string {
  return codes[0] || "DC9";
}
