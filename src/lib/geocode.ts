import { parseLatitude, parseLongitude } from "./coords";
import { cacheGet, cacheSet, geocodeCacheKey } from "./cache";
import { log } from "./logger";

export type GeocodeHit = { latitude: number; longitude: number; label: string; source: string };

const PUBLIC_NOMINATIM = /nominatim\.openstreetmap\.org/i;
const GEOCODE_TTL_SEC = 30 * 24 * 3600;

export function geocoderDisabled(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return env.GEOCODER_DISABLED === "1" || env.E2E === "1";
}

export function isPublicNominatim(url: string) {
  return PUBLIC_NOMINATIM.test(url);
}

export function geocoderReady(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  if (geocoderDisabled(env)) return true;
  if (env.GEOCODER_API_KEY) return true;
  const url = env.GEOCODER_URL || "";
  return Boolean(url) && !isPublicNominatim(url);
}

function provider(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return (env.GEOCODER_PROVIDER || (env.GEOCODER_API_KEY ? "mapbox" : "nominatim")).toLowerCase();
}

async function requestGeocode(
  address: string,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): Promise<GeocodeHit | null> {
  const kind = provider(env);
  const key = env.GEOCODER_API_KEY || "";
  if (kind === "mapbox") {
    if (!key) return null;
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
    url.searchParams.set("access_token", key);
    url.searchParams.set("country", "za");
    url.searchParams.set("limit", "1");
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Array<{ center?: number[]; place_name?: string }> };
    const hit = json.features?.[0];
    const longitude = parseLongitude(hit?.center?.[0]);
    const latitude = parseLatitude(hit?.center?.[1]);
    if (latitude == null || longitude == null) return null;
    return { latitude, longitude, label: hit?.place_name || address, source: "mapbox" };
  }
  if (kind === "google") {
    if (!key) return null;
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", key);
    url.searchParams.set("region", "za");
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }> };
    const hit = json.results?.[0];
    const latitude = parseLatitude(hit?.geometry?.location?.lat);
    const longitude = parseLongitude(hit?.geometry?.location?.lng);
    if (latitude == null || longitude == null) return null;
    return { latitude, longitude, label: hit?.formatted_address || address, source: "google" };
  }
  const endpoint = env.GEOCODER_URL || "";
  if (!endpoint || isPublicNominatim(endpoint)) {
    log.warn("geocode.public_nominatim_blocked", { endpoint: endpoint || "unset" });
    return null;
  }
  const url = new URL(endpoint);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "za");
  const agent = env.GEOCODER_USER_AGENT || env.NEXTAUTH_URL || "sa-ict-ecosystem-map";
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": agent,
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    log.warn("geocode.http_error", { status: res.status });
    return null;
  }
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const hit = rows[0];
  const latitude = parseLatitude(hit?.lat);
  const longitude = parseLongitude(hit?.lon);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude, label: hit.display_name || address, source: kind };
}

export async function geocodeAddress(
  address: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Promise<GeocodeHit | null> {
  const query = address.trim();
  if (!query || geocoderDisabled(env)) return null;
  if (!geocoderReady(env) && env.NODE_ENV === "production") {
    log.warn("geocode.not_configured");
    return null;
  }
  const cacheKey = geocodeCacheKey(query, provider(env));
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as GeocodeHit;
      if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") return parsed;
    } catch {
      // Corrupt cache entries are ignored and re-fetched.
    }
  }
  const hit = await requestGeocode(query, fetchImpl, env);
  if (hit) await cacheSet(cacheKey, JSON.stringify(hit), GEOCODE_TTL_SEC);
  return hit;
}
