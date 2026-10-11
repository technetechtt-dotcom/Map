/** Shared Saved/favourites helpers for anonymous localStorage and signed-in account sync. */

export type Favourite = { kind: string; slug: string; title: string };

export const FAVOURITES_KEY = "ict_map_favourites";
export const ALLOWED_FAVOURITE_KINDS = ["funding", "events", "programmes", "procurement", "location", "organisation"] as const;
export const MAX_FAVOURITES = 100;

export function sanitizeFavouriteString(s: unknown, maxLen = 120): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, maxLen);
}

export function normalizeFavourites(items: unknown): Favourite[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is Favourite => {
      return (
        Boolean(item) &&
        typeof item === "object" &&
        ALLOWED_FAVOURITE_KINDS.includes((item as Favourite).kind as (typeof ALLOWED_FAVOURITE_KINDS)[number]) &&
        typeof (item as Favourite).slug === "string" &&
        (item as Favourite).slug.length > 0 &&
        /^[a-z0-9-_]+$/i.test((item as Favourite).slug) &&
        typeof (item as Favourite).title === "string" &&
        (item as Favourite).title.length > 0
      );
    })
    .slice(0, MAX_FAVOURITES)
    .map((item) => ({
      kind: item.kind,
      slug: sanitizeFavouriteString(item.slug, 80),
      title: sanitizeFavouriteString(item.title, 120),
    }));
}

/** Prefer local title when both sides have the same kind+slug. */
export function mergeFavourites(local: Favourite[], remote: Favourite[]): Favourite[] {
  const map = new Map<string, Favourite>();
  for (const item of [...remote, ...local]) {
    map.set(`${item.kind}:${item.slug}`, item);
  }
  return Array.from(map.values()).slice(0, MAX_FAVOURITES);
}

export function readLocalFavourites(): Favourite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return normalizeFavourites(JSON.parse(localStorage.getItem(FAVOURITES_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function writeLocalFavourites(items: Favourite[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(FAVOURITES_KEY, JSON.stringify(normalizeFavourites(items)));
}

export async function syncFavouritesToAccount(items: Favourite[], signedIn: boolean) {
  if (!signedIn) return;
  await fetch("/api/account/saved", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: normalizeFavourites(items) }),
  }).catch(() => undefined);
}
