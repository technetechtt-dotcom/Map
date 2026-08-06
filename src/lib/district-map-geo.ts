import fs from "fs";
import path from "path";

export type LngLat = [number, number];

export type GeoFeature = {
  type: "Feature";
  properties: { name?: string; code?: string; fill?: string; district?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};

export type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

function loadGeo(file: string): GeoCollection | null {
  try {
    const p = path.join(process.cwd(), "data", "boundaries", file);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as GeoCollection;
  } catch {
    return null;
  }
}

export function loadNcDistricts(): GeoCollection | null {
  return loadGeo("nc_districts.geojson");
}

export function loadNcMunicipalities(): GeoCollection | null {
  return loadGeo("nc_municipalities.geojson");
}

/** Flatten polygon/multipolygon rings to [lng,lat][][] */
export function featureRings(f: GeoFeature): LngLat[][] {
  const g = f.geometry;
  if (g.type === "Polygon") {
    return (g.coordinates as number[][][]).map((r) => r.map((c) => [c[0], c[1]] as LngLat));
  }
  const multi = g.coordinates as number[][][][];
  return multi.flatMap((poly) => poly.map((r) => r.map((c) => [c[0], c[1]] as LngLat)));
}

export type Bounds = { minLng: number; maxLng: number; minLat: number; maxLat: number };

export function boundsOfRings(rings: LngLat[][]): Bounds {
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return { minLng, maxLng, minLat, maxLat };
}

export function extendBounds(b: Bounds, lng: number, lat: number, pad = 0.05): Bounds {
  return {
    minLng: Math.min(b.minLng, lng) - pad,
    maxLng: Math.max(b.maxLng, lng) + pad,
    minLat: Math.min(b.minLat, lat) - pad,
    maxLat: Math.max(b.maxLat, lat) + pad,
  };
}

export type Projector = {
  width: number;
  height: number;
  project: (lng: number, lat: number) => { x: number; y: number };
  pathFromRing: (ring: LngLat[]) => string;
};

export function makeProjector(bounds: Bounds, width = 720, height = 420, pad = 28): Projector {
  const { minLng, maxLng, minLat, maxLat } = bounds;
  const spanLng = Math.max(maxLng - minLng, 0.05);
  const spanLat = Math.max(maxLat - minLat, 0.05);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  // Fit aspect without distortion (equal degrees scaled by cos mid-lat ~ for SA)
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = spanLng * lonScale;
  const scale = Math.min(innerW / spanX, innerH / spanLat);

  const project = (lng: number, lat: number) => {
    const x = pad + (lng - minLng) * lonScale * scale + (innerW - spanX * scale) / 2;
    const y = pad + (maxLat - lat) * scale + (innerH - spanLat * scale) / 2;
    return { x, y };
  };

  const pathFromRing = (ring: LngLat[]) => {
    if (!ring.length) return "";
    return (
      ring
        .map((pt, i) => {
          const { x, y } = project(pt[0], pt[1]);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ") + " Z"
    );
  };

  return { width, height, project, pathFromRing };
}
