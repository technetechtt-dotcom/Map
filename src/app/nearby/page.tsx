"use client";

import { useState } from "react";
import Link from "next/link";

type Row = { id: string; slug: string; name: string; type: string; metres: number };

export default function NearbyPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState("location");
  const [status, setStatus] = useState<string | null>(null);

  function load() {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not available");
      return;
    }
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const params = new URLSearchParams({
        lat: String(pos.coords.latitude),
        lng: String(pos.coords.longitude),
        radiusKm: "50",
        kind,
      });
      const res = await fetch(`/api/nearby?${params}`);
      const data = await res.json();
      setRows(data.results || []);
      setStatus(res.ok ? `${(data.results || []).length} results within 50 km` : data.error || "Nearby lookup failed");
    }, () => setStatus("Could not read your location"));
  }

  return (
    <div className="page">
      <p className="eyebrow">Discover</p>
      <h1>Near me</h1>
      <p className="text-muted mb-4">Find nearby hubs, training centres, universities, events and organisations using your current location.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {["location", "organisation", "event"].map((item) => (
          <button key={item} type="button" className={`chip ${kind === item ? "chip-active" : ""}`} onClick={() => setKind(item)}>{item}</button>
        ))}
        <button type="button" className="btn" onClick={load}>Use my location</button>
      </div>
      {status && <p className="mb-3 text-sm text-muted">{status}</p>}
      <div className="card-grid">
        {rows.map((row) => (
          <article key={row.id} className="panel-card">
            <p className="chip text-xs">{row.type}</p>
            <h2 className="mt-2 font-bold">
              <Link className="text-g700" href={row.type === "organisation" ? `/org/${row.slug}` : row.type === "event" ? `/events/${row.slug}` : `/locations/${row.slug}`}>
                {row.name}
              </Link>
            </h2>
            <p className="text-sm text-muted">{(row.metres / 1000).toFixed(1)} km away</p>
          </article>
        ))}
      </div>
    </div>
  );
}
