export const NC_CAPITAL_CITIES = [
  {
    slug: "kimberley",
    name: "Kimberley",
    district: "Frances Baard",
    role: "Provincial capital",
    color: "#7c3aed",
    fallback: { latitude: -28.73226, longitude: 24.76232 },
  },
  {
    slug: "kuruman",
    name: "Kuruman",
    district: "John Taolo Gaetsewe",
    role: "District seat",
    color: "#0369a1",
    fallback: { latitude: -27.4524, longitude: 23.43246 },
  },
  {
    slug: "kathu",
    name: "Kathu",
    district: "John Taolo Gaetsewe",
    role: "Gamagara municipal seat",
    color: "#0284c7",
    fallback: { latitude: -27.69569, longitude: 23.04929 },
  },
  {
    slug: "upington",
    name: "Upington",
    district: "ZF Mgcawu",
    role: "District seat",
    color: "#3d5a66",
    fallback: { latitude: -28.44776, longitude: 21.25612 },
  },
  {
    slug: "springbok",
    name: "Springbok",
    district: "Namakwa",
    role: "District seat",
    color: "#a16207",
    fallback: { latitude: -29.66434, longitude: 17.8865 },
  },
] as const;

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

export function resolveCapitalPins(
  locations: { slug?: string | null; name?: string | null; latitude?: number | null; longitude?: number | null }[]
): CapitalPin[] {
  const bySlug = new Map(
    locations.filter((l) => l.slug).map((l) => [String(l.slug).toLowerCase(), l])
  );
  const byName = new Map(
    locations.filter((l) => l.name).map((l) => [String(l.name).toLowerCase(), l])
  );

  return NC_CAPITAL_CITIES.map((city, i) => {
    const loc = bySlug.get(city.slug) || byName.get(city.name.toLowerCase());
    const latitude =
      loc?.latitude != null && Number.isFinite(loc.latitude) ? loc.latitude : city.fallback.latitude;
    const longitude =
      loc?.longitude != null && Number.isFinite(loc.longitude) ? loc.longitude : city.fallback.longitude;
    return {
      n: i + 1,
      slug: city.slug,
      name: city.name,
      short: city.name,
      district: city.district,
      role: city.role,
      color: city.color,
      latitude,
      longitude,
    };
  });
}
