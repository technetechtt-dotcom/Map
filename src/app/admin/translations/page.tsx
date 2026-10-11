"use client";

import { FormEvent, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { messages } from "@/lib/i18n";

export default function AdminTranslationsPage() {
  const [entityType, setEntityType] = useState("ui");
  const [entityId, setEntityId] = useState("site");
  const [locale, setLocale] = useState("af");
  const [field, setField] = useState("tagline");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/translations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, locale, fields: { [field]: value } }),
    });
    setMessage(res.ok ? "Translation saved" : "Save failed");
  }

  return (
    <AdminShell>
      <p className="eyebrow">i18n</p>
      <h1 className="mb-4 text-2xl font-extrabold">Translations</h1>
      <p className="text-muted mb-4">Interface strings are available in English, Afrikaans, isiXhosa and isiZulu. Use this form for record-level translations.</p>
      <form onSubmit={onSubmit} className="panel-card grid gap-3 max-w-xl">
        <label className="grid gap-1 text-sm font-semibold">Entity type<input className="field" value={entityType} onChange={(e) => setEntityType(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Entity id<input className="field" value={entityId} onChange={(e) => setEntityId(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Locale
          <select className="field" value={locale} onChange={(e) => setLocale(e.target.value)}>
            {Object.keys(messages).map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Field<input className="field" value={field} onChange={(e) => setField(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Value<textarea className="field min-h-[80px]" value={value} onChange={(e) => setValue(e.target.value)} /></label>
        <button className="btn" type="submit">Save translation</button>
        {message && <p className="text-sm text-muted">{message}</p>}
      </form>
    </AdminShell>
  );
}
