import { loadMdbBookMaps } from "./mdb-boundaries";

const PALETTE = [
  "#C9B3E0",
  "#8EC4E8",
  "#E8C84A",
  "#A8D08D",
  "#7A9EAD",
  "#F4A261",
  "#2A9D8F",
  "#E76F51",
  "#264653",
  "#6D597A",
];

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function districtFill(code?: string | null, name?: string | null) {
  const book = loadMdbBookMaps();
  if (book) {
    const hit = Object.values(book.districts).find(
      (district) => district.code === code || district.name === name
    );
    if (hit?.color) return hit.color;
  }
  return hashHue(code || name || "district");
}

export function withBoundaryFill(
  geojson: unknown,
  code?: string | null,
  name?: string | null
): GeoJSON.Feature | null {
  if (!geojson || typeof geojson !== "object") return null;
  const fill = districtFill(code, name);
  const value = geojson as GeoJSON.GeoJsonObject & {
    properties?: Record<string, unknown>;
    geometry?: GeoJSON.Geometry;
    type?: string;
  };
  if (value.type === "Feature") {
    return {
      ...(value as GeoJSON.Feature),
      properties: {
        ...((value as GeoJSON.Feature).properties || {}),
        fill,
        code: code || undefined,
        name: name || undefined,
      },
    };
  }
  if (value.type === "FeatureCollection") {
    const first = (value as GeoJSON.FeatureCollection).features?.[0];
    return first ? withBoundaryFill(first, code, name) : null;
  }
  return {
    type: "Feature",
    properties: { fill, code: code || undefined, name: name || undefined },
    geometry: value as unknown as GeoJSON.Geometry,
  };
}
