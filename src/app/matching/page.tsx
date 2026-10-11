"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function MatchingPage() {
  const [data, setData] = useState<Record<string, Array<{ score?: number; call?: { slug: string; title: string }; tender?: { slug: string; title: string }; programme?: { slug: string; title: string }; event?: { slug: string; title: string }; organisation?: { slug: string; name: string } }>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matching")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Matching requires a signed-in organisation account");
        setData(body);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <p className="eyebrow">Personalised</p>
      <h1>Opportunity matching</h1>
      <p className="text-muted mb-4">Recommended funding, programmes, procurement, events and organisations for your organisation profile.</p>
      {error && <p className="text-sm text-muted">{error}. <Link className="text-g700 font-semibold" href="/login">Sign in</Link></p>}
      {["funding", "tenders", "programmes", "events", "organisations"].map((key) => (
        <section key={key} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{key}</h2>
          <div className="card-grid">
            {(data[key] || []).map((row, index) => {
              const item = row.call || row.tender || row.programme || row.event || row.organisation;
              const slug = item && "slug" in item ? item.slug : "";
              const title = item && "title" in item ? item.title : item && "name" in item ? item.name : "Match";
              return (
                <article key={`${key}-${index}`} className="panel-card">
                  <p className="chip text-xs">Score {row.score ?? 0}</p>
                  <h3 className="mt-2 font-semibold">{title}</h3>
                  {slug && <Link className="text-g700 text-sm font-semibold" href={`/${key === "tenders" ? "procurement" : key === "organisations" ? "org" : key}/${slug}`}>Open →</Link>}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
