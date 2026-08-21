export const COORD_QUALITY = ["verified", "estimated", "town-centre", "unknown"] as const;
export type CoordQuality = (typeof COORD_QUALITY)[number];

export const WGS84_LAT = { min: -90, max: 90 };
export const WGS84_LNG = { min: -180, max: 180 };
export const SA_LAT = { min: -35, max: -22 };
export const SA_LNG = { min: 16, max: 33 };

export function parseFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function inRange(n: number, range: { min: number; max: number }) {
  return n >= range.min && n <= range.max;
}

/** Parse a latitude. Always requires WGS84; SA envelope unless `allowGlobal` is true. */
export function parseLatitude(value: unknown, allowGlobal = process.env.IMPORT_ALLOW_GLOBAL_COORDS === "1"): number | null {
  const n = parseFiniteNumber(value);
  if (n == null || !inRange(n, WGS84_LAT)) return null;
  if (!allowGlobal && !inRange(n, SA_LAT)) return null;
  return n;
}

export function parseLongitude(value: unknown, allowGlobal = process.env.IMPORT_ALLOW_GLOBAL_COORDS === "1"): number | null {
  const n = parseFiniteNumber(value);
  if (n == null || !inRange(n, WGS84_LNG)) return null;
  if (!allowGlobal && !inRange(n, SA_LNG)) return null;
  return n;
}

export function isCoordQuality(value: string | null | undefined): value is CoordQuality {
  return Boolean(value && (COORD_QUALITY as readonly string[]).includes(value));
}
