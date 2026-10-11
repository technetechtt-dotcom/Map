"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Fav = { kind: string; slug: string; title: string };

const KEY = "ict_map_favourites";

function read(): Fav[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function syncAccount(items: Fav[]) {
  await fetch("/api/account/saved", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  }).catch(() => undefined);
}

export default function SaveFavouriteButton({ kind, slug, title }: { kind: string; slug: string; title: string }) {
  const { status } = useSession();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(read().some((f) => f.kind === kind && f.slug === slug));
    if (status === "authenticated") {
      fetch("/api/account/saved")
        .then((r) => r.json())
        .then((data) => {
          const items: Fav[] = data.items || [];
          if (items.length) {
            localStorage.setItem(KEY, JSON.stringify(items));
            setSaved(items.some((f) => f.kind === kind && f.slug === slug));
          }
        })
        .catch(() => undefined);
    }
  }, [kind, slug, status]);

  function toggle() {
    const current = read();
    const exists = current.some((f) => f.kind === kind && f.slug === slug);
    const next = exists ? current.filter((f) => !(f.kind === kind && f.slug === slug)) : [...current, { kind, slug, title }];
    localStorage.setItem(KEY, JSON.stringify(next.slice(-100)));
    setSaved(!exists);
    if (status === "authenticated") syncAccount(next);
  }

  return (
    <button type="button" className="btn btn-outline" onClick={toggle}>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
