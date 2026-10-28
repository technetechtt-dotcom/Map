"use client";

import { useState } from "react";

export default function AddressPicker({
  latName = "latitude",
  lngName = "longitude",
  addressName = "address",
  requiredCoordinates = false,
}: {
  latName?: string;
  lngName?: string;
  addressName?: string;
  requiredCoordinates?: boolean;
}) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function searchAddress() {
    const query = address.trim();
    if (query.length < 3) {
      setStatus("Enter at least 3 characters to search");
      return;
    }
    setBusy(true);
    setStatus("Searching…");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.result) {
        setStatus(data?.error || "No address match found");
        return;
      }
      setAddress(String(data.result.label || query));
      setLat(String(data.result.latitude));
      setLng(String(data.result.longitude));
      setStatus("Coordinates confirmed from address search");
    } catch {
      setStatus("Address search is temporarily unavailable");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not available in this browser");
      return;
    }
    setBusy(true);
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setStatus("Coordinates confirmed from your current location");
        setBusy(false);
      },
      () => {
        setStatus("Could not read your location. Check browser location permission or enter coordinates manually.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line p-3">
      <label className="grid gap-1 text-sm font-semibold">
        Address search
        <input
          className="field"
          name={addressName}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, town, province"
          autoComplete="street-address"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip" onClick={searchAddress} disabled={busy}>
          {busy && status === "Searching…" ? "Searching…" : "Search address"}
        </button>
        <button type="button" className="chip" onClick={useMyLocation} disabled={busy}>
          {busy && status === "Locating…" ? "Locating…" : "Use my location"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          Latitude
          <input
            className="field"
            name={latName}
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required={requiredCoordinates}
            placeholder="-28.7282"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Longitude
          <input
            className="field"
            name={lngName}
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            required={requiredCoordinates}
            placeholder="24.7499"
          />
        </label>
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        Search an address, use your current location, or enter verified coordinates manually.
        {status ? ` ${status}` : ""}
      </p>
    </div>
  );
}
