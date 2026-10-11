"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  mergeFavourites,
  readLocalFavourites,
  syncFavouritesToAccount,
  writeLocalFavourites,
} from "@/lib/favourites";

export default function SaveFavouriteButton({ kind, slug, title }: { kind: string; slug: string; title: string }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const local = readLocalFavourites();
    setSaved(local.some((f) => f.kind === kind && f.slug === slug));
    if (!signedIn) return;
    fetch("/api/account/saved")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const remote = data?.items || [];
        const merged = mergeFavourites(local, remote);
        writeLocalFavourites(merged);
        setSaved(merged.some((f) => f.kind === kind && f.slug === slug));
        if (JSON.stringify(merged) !== JSON.stringify(remote)) {
          return syncFavouritesToAccount(merged, true);
        }
      })
      .catch(() => undefined);
  }, [kind, slug, signedIn]);

  function toggle() {
    const current = readLocalFavourites();
    const exists = current.some((f) => f.kind === kind && f.slug === slug);
    const next = exists
      ? current.filter((f) => !(f.kind === kind && f.slug === slug))
      : [...current, { kind, slug, title }];
    writeLocalFavourites(next);
    setSaved(!exists);
    syncFavouritesToAccount(next, signedIn);
  }

  return (
    <button type="button" className="btn btn-outline" onClick={toggle}>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
