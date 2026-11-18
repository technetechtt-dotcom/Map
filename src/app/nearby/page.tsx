"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Kind = "location" | "organisation" | "event";
type Row = { id: string; slug: string; name: string; type: string; metres: number };

function resultPath(row: Row) {
  if (row.type === "organisation") return `/org/${encodeURIComponent(row.slug)}`;
  if (row.type === "event") return `/events/${encodeURIComponent(row.slug)}`;
  return `/locations/${encodeURIComponent(row.slug)}`;
}

export default function NearbyPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<Kind>("location");
  const [status, setStatus] = useState("Choose a category, then allow location access to search.");
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);

  function changeKind(next: Kind) {
    requestRef.current += 1;
    setKind(next);
    setRows([]);
    setBusy(false);
    setStatus("Choose Use my location to search this category.");
  }

  function load() {
    const request = ++requestRef.current;
    setRows([]);
    if (typeof navigator === "undefined" || !navigator.geolocation || !window.isSecureContext) {
      setStatus("Location requires a supported browser and a secure (HTTPS) connection.");
      return;
    }
    setBusy(true);
    setStatus("Requesting location permission…");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      if (requestRef.current !== request) return;
      const params = new URLSearchParams({
        lat: String(pos.coords.latitude),
        lng: String(pos.coords.longitude),
        radiusKm: "50",
        kind,
      });
      try {
        const res = await fetch(`/api/nearby?${params}`, { cache: "no-store" });
        const data: { results?: Row[]; error?: string } = await res.json();
        if (requestRef.current !== request) return;
        if (!res.ok || !Array.isArray(data.results)) throw new Error(data.error || "Nearby lookup failed");
        setRows(data.results);
        setStatus(`${data.results.length} results within 50 km`);
      } catch {
        if (requestRef.current !== request) return;
        setStatus("Nearby lookup failed. Check your connection and try again.");
      } finally {
        if (requestRef.current === request) setBusy(false);
      }
    }, (error) => {
      if (requestRef.current !== request) return;
      setBusy(false);
      setStatus(error.code === 1
        ? "Location permission was denied. Enable location access in your browser and try again."
        : "Could not determine your location. Please try again.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }

  return (
    <main className="page">
      <p className="eyebrow">Discover</p>
      <h1>Near me</h1>
      <p className="text-muted mb-4">
        Find nearby hubs, training centres, universities, events and organisations.
        Your location is used only for this search.
      </p>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Nearby category">
        {(["location", "organisation", "event"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={kind === item}
            className={`chip ${kind === item ? "chip-active" : ""}`}
            onClick={() => changeKind(item)}>{item}</button>
        ))}
        <button type="button" className="btn" onClick={load} disabled={busy}>
          {busy ? "Searching…" : "Use my location"}
        </button>
      </div>
      <p className="mb-3 text-sm text-muted" role="status" aria-live="polite">{status}</p>
      <div className="card-grid">
        {rows.map((row) => (
          <article key={row.id} className="panel-card">
            <p className="chip text-xs">{row.type}</p>
            <h2 className="mt-2 font-bold">
              <Link className="text-g700" href={resultPath(row)}>{row.name}</Link>
            </h2>
            <p className="text-sm text-muted">{(row.metres / 1000).toFixed(1)} km away</p>
          </article>
        ))}
      </div>
    </main>
  );
}
