"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

const TYPES = [
  { id: "funding", label: "Funding" },
  { id: "events", label: "Events" },
  { id: "programmes", label: "Programmes" },
  { id: "procurement", label: "Procurement" },
] as const;

const emptyForm = {
  title: "",
  summary: "",
  description: "",
  url: "",
  amount: "",
  deadline: "",
  startsAt: "",
  endsAt: "",
  venue: "",
  onlineUrl: "",
  startDate: "",
  endDate: "",
  closingDate: "",
  budget: "",
  tags: "",
  status: "DRAFT",
};

type Item = Record<string, unknown> & { id: string; title: string; summary: string; status: string };

export default function AdminEcosystemPage() {
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("funding");
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/ecosystem?type=${type}&scope=manage`);
    const data = await r.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    load();
    setEditing(null);
    setForm(emptyForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function field(key: keyof typeof emptyForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload: Record<string, unknown> = {
      type,
      title: form.title,
      summary: form.summary,
      description: form.description,
      url: form.url || undefined,
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      status: form.status,
    };
    if (type === "funding") {
      payload.amount = form.amount;
      payload.deadline = form.deadline || undefined;
    }
    if (type === "events") {
      payload.startsAt = form.startsAt;
      payload.endsAt = form.endsAt || undefined;
      payload.venue = form.venue;
      payload.onlineUrl = form.onlineUrl;
    }
    if (type === "programmes") {
      payload.startDate = form.startDate || undefined;
      payload.endDate = form.endDate || undefined;
    }
    if (type === "procurement") {
      payload.closingDate = form.closingDate || undefined;
      payload.budget = form.budget;
    }
    const r = await fetch(editing ? `/api/ecosystem/${editing}` : "/api/ecosystem", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMessage(d.error || "Save failed");
      return;
    }
    setMessage(editing ? "Updated" : "Created");
    setEditing(null);
    setForm(emptyForm);
    load();
  }

  function openEdit(item: Item) {
    setEditing(item.id);
    setForm({
      ...emptyForm,
      title: String(item.title || ""),
      summary: String(item.summary || ""),
      description: String(item.description || ""),
      url: String(item.url || ""),
      amount: String(item.amount || ""),
      deadline: item.deadline ? String(item.deadline).slice(0, 10) : "",
      startsAt: item.startsAt ? String(item.startsAt).slice(0, 16) : "",
      endsAt: item.endsAt ? String(item.endsAt).slice(0, 16) : "",
      venue: String(item.venue || ""),
      onlineUrl: String(item.onlineUrl || ""),
      startDate: item.startDate ? String(item.startDate).slice(0, 10) : "",
      endDate: item.endDate ? String(item.endDate).slice(0, 10) : "",
      closingDate: item.closingDate ? String(item.closingDate).slice(0, 10) : "",
      budget: String(item.budget || ""),
      tags: Array.isArray(item.tags) ? (item.tags as string[]).join(", ") : "",
      status: String(item.status || "DRAFT"),
    });
  }

  async function setStatus(id: string, status: string) {
    const r = await fetch(`/api/ecosystem/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, status }),
    });
    setMessage(r.ok ? status : "Update failed");
    load();
  }

  async function archive(id: string) {
    const r = await fetch(`/api/ecosystem/${id}?type=${type}`, { method: "DELETE" });
    setMessage(r.ok ? "Archived" : "Archive failed");
    load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Ecosystem</p>
      <h1 className="mb-4 text-2xl font-extrabold">Funding, events, programmes, procurement</h1>
      <p className="text-muted mb-4">Create, edit, publish and archive directory records. Community submissions of these types land here after approval.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button key={t.id} type="button" className={type === t.id ? "chip chip-active" : "chip"} onClick={() => setType(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {message && <p className="mb-3 text-sm font-semibold text-g700">{message}</p>}
      <form onSubmit={onSubmit} className="panel-card mb-6 grid gap-3">
        <h2 className="text-lg font-bold">{editing ? "Edit record" : "Create record"}</h2>
        <label className="grid gap-1 text-sm font-semibold">Title
          <input className="field" value={form.title} onChange={(e) => field("title", e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Summary
          <textarea className="field min-h-[80px]" value={form.summary} onChange={(e) => field("summary", e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Description
          <textarea className="field" value={form.description} onChange={(e) => field("description", e.target.value)} />
        </label>
        {type === "funding" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">Amount
              <input className="field" value={form.amount} onChange={(e) => field("amount", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Deadline
              <input className="field" type="date" value={form.deadline} onChange={(e) => field("deadline", e.target.value)} />
            </label>
          </div>
        )}
        {type === "events" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Starts
                <input className="field" type="datetime-local" value={form.startsAt} onChange={(e) => field("startsAt", e.target.value)} required />
              </label>
              <label className="grid gap-1 text-sm font-semibold">Ends
                <input className="field" type="datetime-local" value={form.endsAt} onChange={(e) => field("endsAt", e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-semibold">Venue
              <input className="field" value={form.venue} onChange={(e) => field("venue", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Online URL
              <input className="field" value={form.onlineUrl} onChange={(e) => field("onlineUrl", e.target.value)} />
            </label>
          </>
        )}
        {type === "programmes" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">Start date
              <input className="field" type="date" value={form.startDate} onChange={(e) => field("startDate", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">End date
              <input className="field" type="date" value={form.endDate} onChange={(e) => field("endDate", e.target.value)} />
            </label>
          </div>
        )}
        {type === "procurement" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">Closing date
              <input className="field" type="date" value={form.closingDate} onChange={(e) => field("closingDate", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Budget
              <input className="field" value={form.budget} onChange={(e) => field("budget", e.target.value)} />
            </label>
          </div>
        )}
        <label className="grid gap-1 text-sm font-semibold">URL
          <input className="field" value={form.url} onChange={(e) => field("url", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Tags (comma-separated)
          <input className="field" value={form.tags} onChange={(e) => field("tags", e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Status
          <select className="field" value={form.status} onChange={(e) => field("status", e.target.value)}>
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING_REVIEW">PENDING_REVIEW</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create"}</button>
          {editing && (
            <button className="chip" type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>
          )}
        </div>
      </form>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="font-semibold">{item.title}</div>
                  <div className="text-xs text-muted">{item.summary}</div>
                </td>
                <td><span className="chip">{item.status}</span></td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip" type="button" onClick={() => openEdit(item)}>Edit</button>
                  <button className="chip chip-active" type="button" onClick={() => setStatus(item.id, "PUBLISHED")}>Publish</button>
                  <button className="chip" type="button" onClick={() => archive(item.id)}>Archive</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="p-4 text-muted">No {type} records yet.</p>}
      </div>
    </AdminShell>
  );
}
