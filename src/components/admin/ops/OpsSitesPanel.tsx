"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Meta = {
  categories: { slug: string; name: string }[];
  provinces: { slug: string; name: string }[];
};

type LocationRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
  province: { name: string; slug: string };
  category: { name: string; slug: string };
};

export default function OpsSitesPanel() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    summary: "",
    latitude: "-28.73",
    longitude: "24.76",
    categorySlug: "knowledge-hub",
    provinceSlug: "northern-cape",
    imageUrl: "",
  });

  async function load() {
    const r = await fetch("/api/locations?scope=manage&limit=80");
    const data = await r.json().catch(() => ({}));
    setRows(data.locations || []);
  }

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => undefined);
    load();
  }, []);

  async function uploadImage(file: File) {
    const body = new FormData();
    body.append("file", file);
    body.append("access", "public");
    const r = await fetch("/api/uploads", { method: "POST", body });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessage(data.error || "Upload failed");
      return;
    }
    setForm((f) => ({ ...f, imageUrl: data.url || "" }));
    setMessage("Image attached to this site.");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const r = await fetch("/api/locations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        summary: form.summary,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        categorySlug: form.categorySlug,
        provinceSlug: form.provinceSlug,
        imageUrl: form.imageUrl || undefined,
        status: "DRAFT",
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMessage(d.error || "Could not create site");
      return;
    }
    setForm((f) => ({ ...f, name: "", summary: "", imageUrl: "" }));
    setMessage("Site created as DRAFT.");
    load();
  }

  async function setStatus(id: string, status: string) {
    const r = await fetch(`/api/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setMessage(r.ok ? `${status} applied` : "Update failed");
    load();
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-extrabold">Sites and map pins</h2>
      <p className="text-muted mb-4 text-sm">
        Upload a site onto the map, attach an image, then verify and publish. Full editor:{" "}
        <Link className="font-semibold text-g700" href="/admin/locations">
          Locations
        </Link>
        .
      </p>
      {message && <p className="mb-3 text-sm font-semibold text-g700">{message}</p>}
      <form onSubmit={onSubmit} className="panel-card mb-6 grid gap-3 md:grid-cols-2">
        <h3 className="md:col-span-2 text-base font-bold">Upload a site</h3>
        <label className="grid gap-1 text-sm font-semibold">
          Name
          <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Image
          <input
            className="field"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadImage(file);
            }}
          />
        </label>
        <label className="md:col-span-2 grid gap-1 text-sm font-semibold">
          Summary
          <textarea className="field min-h-[72px]" required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Latitude
          <input className="field" required value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Longitude
          <input className="field" required value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Category
          <select className="field" value={form.categorySlug} onChange={(e) => setForm({ ...form, categorySlug: e.target.value })}>
            {(meta?.categories || []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Province
          <select className="field" value={form.provinceSlug} onChange={(e) => setForm({ ...form, provinceSlug: e.target.value })}>
            {(meta?.provinces || []).map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create site"}
          </button>
        </div>
      </form>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Province</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link className="font-semibold text-g700" href={`/locations/${row.slug}`}>
                    {row.name}
                  </Link>
                </td>
                <td>{row.province?.name}</td>
                <td>
                  <span className="chip">{row.status}</span>
                </td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip chip-active" type="button" onClick={() => setStatus(row.id, "PUBLISHED")}>
                    Publish
                  </button>
                  <button className="chip" type="button" onClick={() => setStatus(row.id, "ARCHIVED")}>
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">No sites in this scope yet.</p>}
      </div>
    </div>
  );
}
