/**
 * Province overview pins — built only from published DB locations (no hardcoded coords).
 */
export type CapitalPin = {
  n: number;
  slug: string;
  name: string;
  short: string;
  district: string;
  role: string;
  color: string;
  latitude: number;
  longitude: number;
};

const PALETTE = ["#7c3aed", "#0369a1", "#0284c7", "#3d5a66", "#a16207", "#0f766e", "#b45309"];

type Loc = {
  slug?: string | null;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  district?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
};

/** One map pin per district from live locations; falls back to unique named places. */
export function resolveCapitalPins(locations: Loc[]): CapitalPin[] {
  const withCoords = locations.filter(
    (l) =>
      l.latitude != null &&
      l.longitude != null &&
      Number.isFinite(l.latitude) &&
      Number.isFinite(l.longitude)
  );
  if (!withCoords.length) return [];

  const byDistrict = new Map<string, Loc>();
  for (const loc of withCoords) {
    const key = loc.district?.name || loc.slug || loc.name || "place";
    if (!byDistrict.has(key)) byDistrict.set(key, loc);
  }

  return Array.from(byDistrict.values()).map((loc, i) => ({
    n: i + 1,
    slug: String(loc.slug || `pin-${i + 1}`),
    name: String(loc.name || loc.slug || `Site ${i + 1}`),
    short: String(loc.name || loc.slug || `Site ${i + 1}`),
    district: loc.district?.name || "Unassigned",
    role: loc.category?.name || "Published site",
    color: PALETTE[i % PALETTE.length],
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
  }));
}
