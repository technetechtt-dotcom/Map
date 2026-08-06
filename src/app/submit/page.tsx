"use client";

import { FormEvent, useState } from "react";

export default function SubmitPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      summary: String(fd.get("summary") || ""),
      latitude: Number(fd.get("latitude")),
      longitude: Number(fd.get("longitude")),
      categorySlug: String(fd.get("categorySlug") || "knowledge-hub"),
      provinceSlug: String(fd.get("provinceSlug") || "northern-cape"),
      opportunities: String(fd.get("opportunities") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      assets: String(fd.get("assets") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "location",
        submitterName: fd.get("submitterName"),
        submitterEmail: fd.get("submitterEmail"),
        notes: fd.get("notes"),
        website: fd.get("website") || "",
        payload,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus("Thank you — your submission is under review.");
      e.currentTarget.reset();
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || "Submission failed");
    }
  }

  return (
    <div className="page max-w-2xl">
      <p className="eyebrow">Community</p>
      <h1>Submit a listing</h1>
      <p className="text-muted mb-6">
        Propose a location, institution or opportunity for the ecosystem map. Moderators will verify before publish.
      </p>
      <form onSubmit={onSubmit} className="panel-card grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Your name
          <input className="field" name="submitterName" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Your email
          <input className="field" name="submitterEmail" type="email" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Location / organisation name
          <input className="field" name="name" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Summary
          <textarea className="field min-h-[100px]" name="summary" required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Latitude
            <input className="field" name="latitude" type="number" step="any" required defaultValue={-28.73} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Longitude
            <input className="field" name="longitude" type="number" step="any" required defaultValue={24.76} />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-semibold">Category slug
          <input className="field" name="categorySlug" defaultValue="knowledge-hub" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Province slug
          <input className="field" name="provinceSlug" defaultValue="northern-cape" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Opportunities (comma-separated)
          <input className="field" name="opportunities" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Assets (comma-separated)
          <input className="field" name="assets" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Notes for reviewers
          <textarea className="field" name="notes" />
        </label>
        {/* Honeypot — leave blank (bots fill it) */}
        <label className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          Website
          <input className="field" name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit for review"}
        </button>
        {status && <p className="text-sm font-semibold text-g700">{status}</p>}
      </form>
    </div>
  );
}
