"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

type Synonym = { id: string; locale: string; term: string; synonymsJson: string };

export default function AdminSynonymsPage() {
  const [rows, setRows] = useState<Synonym[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/synonyms");
    if (res.ok) {
      const body = await res.json();
      setRows(body.synonyms || []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const synonyms = String(fd.get("synonyms") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/admin/synonyms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: String(fd.get("locale") || "en"),
        term: String(fd.get("term")),
        synonyms,
      }),
    });
    const body = await res.json();
    setMessage(res.ok ? "Synonym saved" : body.error || "Failed");
    if (res.ok) await load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Platform</p>
      <h1>Search synonyms</h1>
      <p className="text-muted mb-6">Expand national unified search vocabulary.</p>
      <form onSubmit={save} className="panel-card mb-6 grid max-w-lg gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Locale
          <select className="field" name="locale" defaultValue="en">
            <option value="en">English</option>
            <option value="af">Afrikaans</option>
            <option value="xh">isiXhosa</option>
            <option value="zu">isiZulu</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Term
          <input className="field" name="term" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Synonyms (comma-separated)
          <input className="field" name="synonyms" placeholder="ict, technology, innovation" />
        </label>
        <button className="btn" type="submit">Save</button>
      </form>
      {message && <p className="mb-4 text-sm font-semibold">{message}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Locale</th><th>Term</th><th>Synonyms</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.locale}</td>
                <td>{r.term}</td>
                <td>{r.synonymsJson}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
