"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  verified: boolean;
  status: string;
  description?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  services?: string[];
  skills?: string[];
  technologies?: string[];
  locationSlugs?: string[];
  relationships?: Array<{ id: string; type: string; organisation: { name: string } }>;
};

const emptyForm = {
  name: "",
  slug: "",
  type: "Digital hub",
  description: "",
  website: "",
  email: "",
  phone: "",
  address: "",
  services: "",
  skills: "",
  technologies: "",
  locationSlugs: "",
};

export default function AdminOrganisationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selected, setSelected] = useState<OrgRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [rel, setRel] = useState({ targetId: "", type: "PARTNER_OF" });

  async function load() {
    const r = await fetch("/api/organisations?scope=manage");
    const d = await r.json().catch(() => ({}));
    setOrgs(d.organisations || []);
  }

  useEffect(() => {
    load().catch(() => setOrgs([]));
  }, []);

  function edit(org: OrgRow) {
    setSelected(org);
    setForm({
      name: org.name,
      slug: org.slug,
      type: org.type,
      description: org.description || "",
      website: org.website || "",
      email: org.email || "",
      phone: org.phone || "",
      address: org.address || "",
      services: (org.services || []).join(", "),
      skills: (org.skills || []).join(", "),
      technologies: (org.technologies || []).join(", "),
      locationSlugs: (org.locationSlugs || []).join(", "),
    });
  }

  function payload() {
    return {
      ...form,
      services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      technologies: form.technologies.split(",").map((s) => s.trim()).filter(Boolean),
      locationSlugs: form.locationSlugs.split(",").map((s) => s.trim()).filter(Boolean),
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const body = selected ? { id: selected.id, ...payload() } : payload();
    const r = await fetch("/api/organisations", {
      method: selected ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setMessage(r.ok ? "Organisation saved" : d.error || "Save failed");
    if (r.ok) {
      setSelected(null);
      setForm(emptyForm);
      load();
    }
  }

  async function setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, ...extra }),
    });
    setMessage(r.ok ? `${status} applied` : "Update failed");
    load();
  }

  async function addRelationship() {
    if (!selected) return;
    const r = await fetch("/api/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: selected.id, targetId: rel.targetId, type: rel.type, status: "PUBLISHED" }),
    });
    setMessage(r.ok ? "Relationship saved" : "Relationship failed");
    load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Organisations</p>
      <h1 className="mb-4 text-2xl font-extrabold">Create, edit and lifecycle</h1>
      {message && <p className="mb-3 text-sm text-muted">{message}</p>}
      <form onSubmit={save} className="panel-card mb-6 grid gap-3 md:grid-cols-2">
        {Object.entries({ name: "Name", slug: "Slug", type: "Organisation type", website: "Website", email: "Email", phone: "Phone", address: "Address" }).map(([key, label]) => (
          <label key={key} className="grid gap-1 text-sm font-semibold">
            {label}
            <input className="field" value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "name" || key === "slug" || key === "type"} />
          </label>
        ))}
        <label className="grid gap-1 text-sm font-semibold md:col-span-2">
          Description
          <textarea className="field min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Services<input className="field" value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Skills<input className="field" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Technologies<input className="field" value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Linked location slugs<input className="field" value={form.locationSlugs} onChange={(e) => setForm({ ...form, locationSlugs: e.target.value })} /></label>
        <div className="flex gap-2">
          <button className="btn" type="submit">{selected ? "Update organisation" : "Create organisation"}</button>
          {selected && <button type="button" className="secondary-button" onClick={() => { setSelected(null); setForm(emptyForm); }}>Cancel</button>}
        </div>
      </form>
      {selected && (
        <div className="panel-card mb-6 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">Target organisation
            <select className="field" value={rel.targetId} onChange={(e) => setRel({ ...rel, targetId: e.target.value })}>
              <option value="">Select</option>
              {orgs.filter((o) => o.id !== selected.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">Relationship
            <select className="field" value={rel.type} onChange={(e) => setRel({ ...rel, type: e.target.value })}>
              {["PARTNER_OF", "FUNDED_BY", "SUPPLIER_TO", "INCUBATED_BY", "TRAINED_BY", "MEMBER_OF", "INVESTED_IN", "HOSTS", "DELIVERS_PROGRAMME"].map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="button" className="chip" onClick={addRelationship}>Add relationship</button></div>
        </div>
      )}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>
                  <button type="button" className="font-semibold text-g700" onClick={() => edit(o)}>{o.name}</button>
                  <div className="text-xs text-muted">{o.slug}</div>
                </td>
                <td>{o.type}</td>
                <td><span className="chip">{o.status}</span></td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip" type="button" onClick={() => edit(o)}>Edit</button>
                  <ConfirmAction label="Publish" tone="primary" requireReason onConfirm={(reason) => setStatus(o.id, "PUBLISHED", { verificationSource: reason })} />
                  <ConfirmAction label="Archive" requireReason onConfirm={(reason) => setStatus(o.id, "ARCHIVED", { verificationSource: reason })} />
                  {o.status === "ARCHIVED" && <ConfirmAction label="Restore" tone="primary" onConfirm={() => setStatus(o.id, "DRAFT")} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm"><Link className="text-g700 font-semibold" href="/admin/claims">Review claims →</Link> · <Link className="text-g700 font-semibold" href="/admin/organisations/merge">Merge duplicates →</Link></p>
    </AdminShell>
  );
}
