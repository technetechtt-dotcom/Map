import fs from "fs";
import path from "path";

/**
 * MDB district/local polygons — same pack as the book (`DistrictPinMap`).
 * Colours match municipalities.co.za district palette.
 */

type SheetMun = {
  name: string;
  label?: string;
  fill: string;
  geometry: GeoJSON.Geometry;
  centroid?: { lng: number; lat: number };
};

type DistrictSheet = {
  code: string;
  slug: string;
  name: string;
  color: string;
  geometry: GeoJSON.Geometry;
  municipalities: SheetMun[];
};

type BookMaps = {
  attribution?: string;
  districts: Record<string, DistrictSheet>;
};

let cache: BookMaps | null | undefined;

export function loadMdbBookMaps(): BookMaps | null {
  if (cache !== undefined) return cache;
  try {
    const p = path.join(process.cwd(), "data", "boundaries", "mdb", "nc_mdb_book.json");
    if (!fs.existsSync(p)) {
      cache = null;
      return null;
    }
    cache = JSON.parse(fs.readFileSync(p, "utf8")) as BookMaps;
    return cache;
  } catch {
    cache = null;
    return null;
  }
}

/** Clear cache (e.g. after regenerating maps:mdb). */
export function clearMdbBookMapsCache() {
  cache = undefined;
}

export function mdbDistrictFeatureCollection(): GeoJSON.FeatureCollection | null {
  const book = loadMdbBookMaps();
  if (!book) return null;
  const features: GeoJSON.Feature[] = Object.values(book.districts).map((d) => ({
    type: "Feature",
    properties: {
      name: d.name,
      code: d.code,
      fill: d.color,
      source: "mdb",
      level: "district",
    },
    geometry: d.geometry,
  }));
  return { type: "FeatureCollection", features };
}

export function mdbMunicipalityFeatureCollection(): GeoJSON.FeatureCollection | null {
  const book = loadMdbBookMaps();
  if (!book) return null;
  const features: GeoJSON.Feature[] = [];
  for (const d of Object.values(book.districts)) {
    for (const m of d.municipalities || []) {
      features.push({
        type: "Feature",
        properties: {
          name: m.name,
          fill: m.fill || d.color,
          district: d.name,
          districtCode: d.code,
          source: "mdb",
          level: "municipality",
        },
        geometry: m.geometry,
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** True when MDB book pack is available for the platform map. */
export function hasMdbBoundaries(): boolean {
  return Boolean(loadMdbBookMaps());
}
