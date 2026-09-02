"use client";

import { useEffect, useState } from "react";

type Fav = { kind: string; slug: string; title: string };

const KEY = "ict_map_favourites";

function read(): Fav[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Fav[];
  } catch {
    return [];
  }
}

export default function SaveFavouriteButton({ kind, slug, title }: { kind: string; slug: string; title: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(read().some((f) => f.kind === kind && f.slug === slug));
  }, [kind, slug]);

  function toggle() {
    const current = read();
    const exists = current.some((f) => f.kind === kind && f.slug === slug);
    const next = exists ? current.filter((f) => !(f.kind === kind && f.slug === slug)) : [...current, { kind, slug, title }];
    localStorage.setItem(KEY, JSON.stringify(next.slice(-100)));
    setSaved(!exists);
  }

  return (
    <button type="button" className="btn btn-outline" onClick={toggle}>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
