"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  type Favourite,
  mergeFavourites,
  readLocalFavourites,
  syncFavouritesToAccount,
  writeLocalFavourites,
} from "@/lib/favourites";

function itemHref(f: Favourite): string {
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
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const local = readLocalFavourites();
    setFavourites(local);
    setMounted(true);
    if (!signedIn) return;
    fetch("/api/account/saved")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const remote: Favourite[] = data?.items || [];
        const merged = mergeFavourites(local, remote);
        writeLocalFavourites(merged);
        setFavourites(merged);
        if (JSON.stringify(merged) !== JSON.stringify(remote)) {
          return syncFavouritesToAccount(merged, true);
        }
      })
      .catch(() => undefined);
  }, [signedIn]);

  function persist(next: Favourite[]) {
    writeLocalFavourites(next);
    setFavourites(next);
    syncFavouritesToAccount(next, signedIn);
  }

  function remove(kind: string, slug: string) {
    persist(favourites.filter((f) => !(f.kind === kind && f.slug === slug)));
  }

  function clearAll() {
    if (!confirm("Remove all saved favourites?")) return;
    persist([]);
  }

  return (
    <div className="page max-w-4xl">
      <p className="eyebrow">Personal workspace</p>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1>Saved opportunities &amp; contacts</h1>
          <p className="text-muted text-sm mt-1">
            Signed-in accounts sync Saved items. Anonymous visitors keep browser-only favourites.
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
            <Link href="/funding" className="btn">Browse Funding</Link>
            <Link href="/procurement" className="btn btn-outline">Browse Procurement</Link>
            <Link href="/events" className="btn btn-outline">Browse Events</Link>
            <Link href="/programmes" className="btn btn-outline">Browse Programmes</Link>
            <Link href="/organisations" className="btn btn-outline">Browse Organisations</Link>
          </div>
        </div>
      )}

      {mounted && favourites.length > 0 && (
        <div className="grid gap-3">
          {favourites.map((f) => (
            <article key={`${f.kind}-${f.slug}`} className="panel-card flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="chip text-xs mr-2">{KIND_LABEL[f.kind] || f.kind}</span>
                <Link href={itemHref(f)} className="font-bold text-g700 hover:underline text-base align-middle">
                  {f.title || f.slug}
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <Link href={itemHref(f)} className="btn btn-outline text-xs">Open →</Link>
                <button type="button" onClick={() => remove(f.kind, f.slug)} className="chip text-xs hover:bg-red-50 hover:text-red-700">
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
