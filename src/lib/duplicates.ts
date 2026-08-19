/**
 * Fuzzy / exact duplicate matching for organisations and locations.
 */

export function normalizeName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Simple token Jaccard similarity 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  Array.from(ta).forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

export type NamedEntity = {
  id: string;
  name: string;
  provinceId?: string | null;
  slug?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

function domain(value?: string | null): string {
  if (!value) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function digits(value?: string | null): string {
  return String(value || "").replace(/\D/g, "").replace(/^27/, "0");
}

export function findDuplicateCandidates<T extends NamedEntity>(
  candidate: Omit<NamedEntity, "id">,
  existing: T[],
  opts?: { threshold?: number; sameProvinceOnly?: boolean }
): Array<T & { score: number }> {
  const threshold = opts?.threshold ?? 0.72;
  const sameProvinceOnly = opts?.sameProvinceOnly ?? true;
  const out: Array<T & { score: number }> = [];
  for (const row of existing) {
    if (
      sameProvinceOnly &&
      candidate.provinceId &&
      row.provinceId &&
      candidate.provinceId !== row.provinceId
    ) {
      continue;
    }
    const exact = normalizeName(candidate.name) === normalizeName(row.name);
    let score = exact ? 1 : nameSimilarity(candidate.name, row.name);
    const candidateDomain = domain(candidate.website);
    if (candidateDomain && candidateDomain === domain(row.website)) score = Math.max(score, 0.98);
    if (candidate.email && row.email && candidate.email.toLowerCase() === row.email.toLowerCase()) score = Math.max(score, 0.99);
    const candidatePhone = digits(candidate.phone);
    if (candidatePhone.length >= 9 && candidatePhone === digits(row.phone)) score = Math.max(score, 0.97);
    if (candidate.address && row.address && nameSimilarity(candidate.address, row.address) >= 0.8) score = Math.max(score, 0.9);
    if (score >= threshold) out.push({ ...row, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Haversine distance metres between two WGS84 points */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findNearbyLocations(
  point: { latitude: number; longitude: number },
  existing: Array<{ id: string; name: string; latitude: number; longitude: number }>,
  radiusM = 250
) {
  return existing
    .map((e) => ({
      ...e,
      distanceM: distanceMetres(point.latitude, point.longitude, e.latitude, e.longitude),
    }))
    .filter((e) => e.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}
