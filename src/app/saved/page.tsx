"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Fav = { kind: string; slug: string; title: string };

const KEY = "ict_map_favourites";

function readFavourites(): Fav[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Fav[];
  } catch {
    return [];
  }
}

function itemHref(f: Fav): string {
  if (f.kind === "funding") return `/funding/${f.slug}`;
  if (f.kind === "events") return `/events/${f.slug}`;
  if (f.kind === "programmes") return `/programmes/${f.slug}`;
  if (f.kind === "procurement") return `/procurement/${f.slug}`;
  if (f.kind === "location") return `/locations/${f.slug}`;
  if (f.kind === "organisation") return `/org/${f.slug}`;
  return `/${f.kind}/${f.slug}`;
}

const KIND_LABEL: Record<string, string> = {
  funding: "Funding Call",
  events: "Event",
  programmes: "Programme",
  procurement: "Procurement / Tender",
  location: "Location",
  organisation: "Organisation",
};

export default function SavedPage() {
  const [favourites, setFavourites] = useState<Fav[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setFavourites(readFavourites());
    setMounted(true);
  }, []);

  function remove(kind: string, slug: string) {
    const next = favourites.filter((f) => !(f.kind === kind && f.slug === slug));
    localStorage.setItem(KEY, JSON.stringify(next));
    setFavourites(next);
  }

  function clearAll() {
    if (!confirm("Remove all saved favourites?")) return;
    localStorage.removeItem(KEY);
    setFavourites([]);
  }

  return (
    <div className="page max-w-4xl">
      <p className="eyebrow">Personal workspace</p>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1>Saved opportunities &amp; contacts</h1>
          <p className="text-muted text-sm mt-1">
            Items you have bookmarked across the platform. Stored privately in your local browser session.
          </p>
        </div>
        {mounted && favourites.length > 0 && (
          <button type="button" onClick={clearAll} className="btn btn-outline text-xs">
            Clear all ({favourites.length})
          </button>
        )}
      </div>

      {!mounted && <div className="panel-card text-muted text-sm">Loading saved items…</div>}

      {mounted && favourites.length === 0 && (
        <div className="panel-card text-center py-12">
          <h2 className="text-lg font-bold mb-2">No saved items yet</h2>
          <p className="text-muted text-sm max-w-md mx-auto mb-6">
            When you find a funding call, tender, event, programme, or organisation you want to track,
            click the <strong>Save</strong> button on its profile to bookmark it here.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <Link href="/funding" className="btn">
              Browse Funding
            </Link>
            <Link href="/procurement" className="btn btn-outline">
              Browse Procurement
            </Link>
            <Link href="/events" className="btn btn-outline">
              Browse Events
            </Link>
            <Link href="/programmes" className="btn btn-outline">
              Browse Programmes
            </Link>
            <Link href="/organisations" className="btn btn-outline">
              Browse Organisations
            </Link>
          </div>
        </div>
      )}

      {mounted && favourites.length > 0 && (
        <div className="grid gap-3">
          {favourites.map((f) => (
            <article
              key={`${f.kind}-${f.slug}`}
              className="panel-card flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <span className="chip text-xs mr-2">{KIND_LABEL[f.kind] || f.kind}</span>
                <Link
                  href={itemHref(f)}
                  className="font-bold text-g700 hover:underline text-base align-middle"
                >
                  {f.title || f.slug}
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <Link href={itemHref(f)} className="btn btn-outline text-xs">
                  Open →
                </Link>
                <button
                  type="button"
                  onClick={() => remove(f.kind, f.slug)}
                  className="chip text-xs hover:bg-red-50 hover:text-red-700"
                  title="Remove from saved"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
