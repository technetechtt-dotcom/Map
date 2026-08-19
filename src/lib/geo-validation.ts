type Position = [number, number];

function inRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, polygon: Position[][]): boolean {
  return Boolean(polygon[0] && inRing(lng, lat, polygon[0]) && !polygon.slice(1).some((hole) => inRing(lng, lat, hole)));
}

export function pointInGeoJson(lng: number, lat: number, value: unknown): boolean | null {
  const collection = value as { type?: string; features?: unknown[] } | null;
  if (collection?.type === "FeatureCollection" && Array.isArray(collection.features)) {
    const results = collection.features.map((feature) => pointInGeoJson(lng, lat, feature));
    return results.some((result) => result === true)
      ? true
      : results.some((result) => result === null)
        ? null
        : false;
  }
  const feature = value as { type?: string; geometry?: unknown } | null;
  const geometry = (feature?.type === "Feature" ? feature.geometry : value) as { type?: string; coordinates?: unknown } | null;
  if (!geometry?.type || !geometry.coordinates) return null;
  if (geometry.type === "Polygon") return inPolygon(lng, lat, geometry.coordinates as Position[][]);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Position[][][]).some((polygon) => inPolygon(lng, lat, polygon));
  return null;
}

/**
 * Validate a point against an administrative geometry when one is available.
 * A missing geometry is explicitly reported as `unknown` so deployments can
 * stage boundary datasets without accidentally rejecting otherwise valid data.
 */
export function validatePointAssignment(
  lng: number,
  lat: number,
  geometry: unknown
): "valid" | "invalid" | "unknown" {
  const result = pointInGeoJson(lng, lat, geometry);
  return result === true ? "valid" : result === false ? "invalid" : "unknown";
}
