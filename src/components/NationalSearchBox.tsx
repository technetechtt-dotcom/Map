"use client";

import { FormEvent, useState } from "react";

type Result = { kind: string; slug: string; title: string; summary: string | null; rank: number; headline: string };

export default function NationalSearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length < 2) return;
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=30`);
    const body = await res.json();
    setResults(body.results || []);
    setLoading(false);
  }

  function hrefFor(row: Result) {
    if (row.kind === "location") return `/locations/${row.slug}`;
    if (row.kind === "organisation") return `/organisations/${row.slug}`;
    if (row.kind === "funding") return `/funding/${row.slug}`;
    if (row.kind === "programme") return `/programmes/${row.slug}`;
    if (row.kind === "event") return `/events/${row.slug}`;
    if (row.kind === "procurement") return `/procurement/${row.slug}`;
    return "#";
  }

  return (
    <section className="panel-card mb-6">
      <h2 className="text-lg font-bold">National unified search</h2>
      <p className="text-muted text-sm">Search locations, organisations, funding, programmes, events and procurement.</p>
      <form onSubmit={search} className="mt-3 flex flex-wrap gap-2">
        <input className="field flex-1 min-w-[12rem]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nationally…" />
        <button className="btn" type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
      </form>
      <ul className="mt-4 space-y-3">
        {results.map((row) => (
          <li key={`${row.kind}-${row.slug}`} className="border-t border-black/10 pt-3">
            <a href={hrefFor(row)} className="font-semibold text-g700">{row.title}</a>
            <span className="ml-2 chip">{row.kind}</span>
            {row.headline && <p className="text-sm text-muted mt-1" dangerouslySetInnerHTML={{ __html: row.headline }} />}
          </li>
        ))}
        {!loading && results.length === 0 && q.length >= 2 && <li className="text-muted text-sm">No results.</li>}
      </ul>
    </section>
  );
}
