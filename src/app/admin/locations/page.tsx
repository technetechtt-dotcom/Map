"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import type { PublicLocation } from "@/lib/shape";
import Link from "next/link";

type Meta = {
  categories: { id: string; slug: string; name: string }[];
  provinces: { id: string; slug: string; name: string; code: string }[];
};

const emptyForm = {
  name: "",
  summary: "",
  description: "",
  latitude: "-28.73",
  longitude: "24.76",
  categorySlug: "knowledge-hub",
  provinceSlug: "northern-cape",
  website: "",
  email: "",
  phone: "",
  address: "",
  imageUrl: "",
  opportunities: "",
  assets: "",
  verificationSource: "",
  status: "DRAFT",
  sourceTitle: "",
  sourceUrl: "",
};

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<PublicLocation | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    const params = new URLSearchParams({ scope: "manage", limit: "500" });
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    const r = await fetch(`/api/locations?${params}`);
    const data = await r.json();
    setLocations(data.locations || []);
  }

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(console.error);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(loc: PublicLocation) {
    setEditing(loc);
    setShowCreate(false);
    setForm({
      name: loc.name,
      summary: loc.summary,
      description: loc.description || "",
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      categorySlug: loc.category.slug,
      provinceSlug: loc.province.slug,
      website: loc.website || "",
      email: loc.email || "",
      phone: loc.phone || "",
      address: loc.address || "",
      imageUrl: loc.imageUrl || "",
      opportunities: loc.opportunities.join(", "),
      assets: loc.assets.join(", "),
      verificationSource: loc.verificationSource || "",
      status: loc.status,
      sourceTitle: "",
      sourceUrl: "",
    });
  }

  function openCreate() {
    setEditing(null);
    setShowCreate(true);
    setForm(emptyForm);
  }

  async function setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const r = await fetch(`/api/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    if (r.ok) {
      setMessage(`${status} applied`);
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      setMessage(d.error || "Update failed");
    }
  }

  async function uploadImage(file: File) {
    const body = new FormData();
    body.append("file", file);
    const r = await fetch("/api/uploads", { method: "POST", body });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessage(data.error || "Upload failed");
      return;
    }
    setForm((f) => ({ ...f, imageUrl: data.url }));
    setMessage(`Image uploaded: ${data.url}`);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const payload = {
      name: form.name,
      summary: form.summary,
      description: form.description || null,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      website: form.website || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      imageUrl: form.imageUrl || null,
      opportunities: form.opportunities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      assets: form.assets
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      verificationSource: form.verificationSource || null,
      status: form.status,
      categorySlug: form.categorySlug,
      provinceSlug: form.provinceSlug,
      sourceTitle: form.sourceTitle || undefined,
      sourceUrl: form.sourceUrl || undefined,
    };

    let r: Response;
    if (editing) {
      const categoryId = meta?.categories.find((c) => c.slug === form.categorySlug)?.id;
      const provinceId = meta?.provinces.find((p) => p.slug === form.provinceSlug)?.id;
      r = await fetch(`/api/locations/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          categoryId,
          provinceId,
        }),
      });
    } else {
      r = await fetch("/api/locations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    if (r.ok) {
      setMessage(editing ? "Location updated" : "Location created");
      setEditing(null);
      setShowCreate(false);
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      setMessage(d.error || "Save failed — are you signed in?");
    }
  }

  const showForm = editing || showCreate;

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Workflow</p>
          <h1 className="text-2xl font-extrabold">Locations</h1>
          <p className="text-muted text-sm">Create, edit, verify, publish, attach images and sources.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="field w-48"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="field w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {["DRAFT", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED", "REJECTED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn-outline" type="button" onClick={load}>
            Filter
          </button>
          <button className="btn" type="button" onClick={openCreate}>
            New location
          </button>
        </div>
      </div>

      {message && <p className="mb-3 text-sm font-semibold text-g700">{message}</p>}

      {showForm && (
        <form onSubmit={save} className="panel-card mb-6 grid gap-3 md:grid-cols-2">
          <h2 className="md:col-span-2 text-lg font-bold">
            {editing ? `Edit: ${editing.name}` : "Create location"}
          </h2>
          <label className="grid gap-1 text-sm font-semibold">
            Name
            <input
              className="field"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Status
            <select
              className="field"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {["DRAFT", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 grid gap-1 text-sm font-semibold">
            Summary
            <textarea
              className="field min-h-[72px]"
              required
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </label>
          <label className="md:col-span-2 grid gap-1 text-sm font-semibold">
            Full description
            <textarea
              className="field min-h-[90px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Latitude
            <input
              className="field"
              required
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Longitude
            <input
              className="field"
              required
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Category
            <select
              className="field"
              value={form.categorySlug}
              onChange={(e) => setForm({ ...form, categorySlug: e.target.value })}
            >
              {(meta?.categories || []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Province
            <select
              className="field"
              value={form.provinceSlug}
              onChange={(e) => setForm({ ...form, provinceSlug: e.target.value })}
            >
              {(meta?.provinces || []).map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Website
            <input
              className="field"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Email
            <input
              className="field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Phone
            <input
              className="field"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Address
            <input
              className="field"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="md:col-span-2 grid gap-1 text-sm font-semibold">
            Opportunities (comma-separated)
            <input
              className="field"
              value={form.opportunities}
              onChange={(e) => setForm({ ...form, opportunities: e.target.value })}
            />
          </label>
          <label className="md:col-span-2 grid gap-1 text-sm font-semibold">
            Assets (comma-separated)
            <input
              className="field"
              value={form.assets}
              onChange={(e) => setForm({ ...form, assets: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Verification source
            <input
              className="field"
              value={form.verificationSource}
              onChange={(e) => setForm({ ...form, verificationSource: e.target.value })}
            />
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
            {form.imageUrl && (
              <span className="text-xs text-muted">
                Current: <a className="text-g700" href={form.imageUrl}>{form.imageUrl}</a>
              </span>
            )}
          </label>
          {!editing && (
            <>
              <label className="grid gap-1 text-sm font-semibold">
                Source title
                <input
                  className="field"
                  value={form.sourceTitle}
                  onChange={(e) => setForm({ ...form, sourceTitle: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Source URL
                <input
                  className="field"
                  value={form.sourceUrl}
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                />
              </label>
            </>
          )}
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create"}
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setEditing(null);
                setShowCreate(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Province</th>
              <th>Category</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link className="font-semibold text-g700" href={`/locations/${l.slug}`}>
                    {l.name}
                  </Link>
                </td>
                <td>{l.province.name}</td>
                <td>{l.category.name}</td>
                <td>
                  <span className="chip">{l.status}</span>
                </td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip" type="button" onClick={() => openEdit(l)}>
                    Edit
                  </button>
                  <button className="chip" type="button" onClick={() => setStatus(l.id, "VERIFIED", { verificationTier: "desktop" })}>
                    Desktop verify
                  </button>
                  <button className="chip" type="button" onClick={() => setStatus(l.id, "VERIFIED", { verificationTier: "field" })}>
                    Field verify
                  </button>
                  <button
                    className="chip chip-active"
                    type="button"
                    onClick={() => setStatus(l.id, "PUBLISHED")}
                  >
                    Publish
                  </button>
                  <button className="chip" type="button" onClick={() => setStatus(l.id, "DRAFT")}>
                    Draft
                  </button>
                  <button className="chip" type="button" onClick={() => setStatus(l.id, "ARCHIVED")}>
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
