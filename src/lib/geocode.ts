import { parseLatitude, parseLongitude } from "./coords";
import { log } from "./logger";

export type GeocodeHit = { latitude: number; longitude: number; label: string; source: string };

export function geocoderDisabled(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return env.GEOCODER_DISABLED === "1" || env.E2E === "1";
}

export async function geocodeAddress(
  address: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Promise<GeocodeHit | null> {
  const query = address.trim();
  if (!query || geocoderDisabled(env)) return null;
  const endpoint = env.GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
  const agent = env.GEOCODER_USER_AGENT || env.NEXTAUTH_URL || "sa-ict-ecosystem-map";
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "za");
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": agent },
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
  return { latitude, longitude, label: hit.display_name || query, source: "nominatim" };
}
