"use client";

import { useState } from "react";

export default function AddressPicker({
  latName = "latitude",
  lngName = "longitude",
  addressName = "address",
}: {
  latName?: string;
  lngName?: string;
  addressName?: string;
}) {
  const [lat, setLat] = useState("-28.738");
  const [lng, setLng] = useState("24.763");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function searchAddress() {
    if (!address.trim()) return;
    setStatus("Searching…");
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=za&limit=1`, {
      headers: { Accept: "application/json" },
    });
    const rows = await res.json().catch(() => []);
    if (!rows[0]) {
      setStatus("No address match found");
      return;
    }
    setLat(rows[0].lat);
    setLng(rows[0].lon);
    setStatus("Pin placed from address search");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setStatus("Pin placed from your location");
      },
      () => setStatus("Could not read your location")
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line p-3">
      <label className="grid gap-1 text-sm font-semibold">
        Address search
        <input className="field" name={addressName} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, town, province" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip" onClick={searchAddress}>Search address</button>
        <button type="button" className="chip" onClick={useMyLocation}>Use my location</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          Latitude
          <input className="field" name={latName} value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Longitude
          <input className="field" name={lngName} value={lng} onChange={(e) => setLng(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-muted">Move the values after searching, or drop a pin by editing coordinates. {status}</p>
    </div>
  );
}
