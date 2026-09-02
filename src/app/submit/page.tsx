"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const TYPES = [
  { id: "location", label: "Location / site" },
  { id: "organisation", label: "Organisation" },
  { id: "funding", label: "Funding opportunity" },
  { id: "events", label: "Event" },
  { id: "programmes", label: "Programme" },
  { id: "procurement", label: "Procurement / tender" },
] as const;

function SubmitForm() {
  const params = useSearchParams();
  const initialType = TYPES.some((t) => t.id === params.get("type")) ? (params.get("type") as (typeof TYPES)[number]["id"]) : "location";
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>(initialType);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const typeLabel = useMemo(() => TYPES.find((t) => t.id === type)?.label || "listing", [type]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("name") || "");
    const payload: Record<string, unknown> = {
      name: title,
      title,
      summary: String(fd.get("summary") || ""),
      provinceSlug: String(fd.get("provinceSlug") || "northern-cape"),
      url: String(fd.get("url") || "") || undefined,
    };
    if (type === "location") {
      payload.latitude = Number(fd.get("latitude"));
      payload.longitude = Number(fd.get("longitude"));
      payload.categorySlug = String(fd.get("categorySlug") || "knowledge-hub");
      payload.opportunities = String(fd.get("opportunities") || "").split(",").map((s) => s.trim()).filter(Boolean);
      payload.assets = String(fd.get("assets") || "").split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (type === "funding") {
      payload.amount = String(fd.get("amount") || "") || undefined;
      payload.deadline = String(fd.get("deadline") || "") || undefined;
    }
    if (type === "events") {
      payload.startsAt = String(fd.get("startsAt") || "") || undefined;
      payload.venue = String(fd.get("venue") || "") || undefined;
      payload.onlineUrl = String(fd.get("onlineUrl") || "") || undefined;
    }
    if (type === "programmes") payload.startDate = String(fd.get("startDate") || "") || undefined;
    if (type === "procurement") {
      payload.closingDate = String(fd.get("closingDate") || "") || undefined;
      payload.budget = String(fd.get("budget") || "") || undefined;
    }
    if (type === "organisation") payload.website = String(fd.get("url") || "") || undefined;

    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        submitterName: fd.get("submitterName"),
        submitterEmail: fd.get("submitterEmail"),
        notes: fd.get("notes"),
        website: fd.get("website") || "",
        consent: fd.get("consent") === "on",
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
        Propose a {typeLabel.toLowerCase()} for the ecosystem directory. Moderators verify before publish. Locations still need coordinates; funding, events, programmes and procurement do not.
      </p>
      <form onSubmit={onSubmit} className="panel-card grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Listing type
          <select className="field" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number]["id"])}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Your name
          <input className="field" name="submitterName" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Your email
          <input className="field" name="submitterEmail" type="email" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Name / title
          <input className="field" name="name" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Summary
          <textarea className="field min-h-[100px]" name="summary" required />
        </label>
        {type === "location" && (
          <>
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
            <label className="grid gap-1 text-sm font-semibold">Opportunities (comma-separated)
              <input className="field" name="opportunities" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Assets (comma-separated)
              <input className="field" name="assets" />
            </label>
          </>
        )}
        {type === "funding" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">Amount
              <input className="field" name="amount" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Deadline
              <input className="field" name="deadline" type="date" />
            </label>
          </div>
        )}
        {type === "events" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Starts
              <input className="field" name="startsAt" type="datetime-local" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Venue
              <input className="field" name="venue" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Online URL
              <input className="field" name="onlineUrl" />
            </label>
          </>
        )}
        {type === "programmes" && (
          <label className="grid gap-1 text-sm font-semibold">Start date
            <input className="field" name="startDate" type="date" />
          </label>
        )}
        {type === "procurement" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">Closing date
              <input className="field" name="closingDate" type="date" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Budget
              <input className="field" name="budget" />
            </label>
          </div>
        )}
        <label className="grid gap-1 text-sm font-semibold">Province slug
          <input className="field" name="provinceSlug" defaultValue="northern-cape" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Website / source URL
          <input className="field" name="url" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Notes for reviewers
          <textarea className="field" name="notes" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-1" />
          <span>
            I consent to the platform processing my name and email to review this
            submission, as described in the{" "}
            <a className="text-g700 font-semibold" href="/privacy">privacy notice</a>.
          </span>
        </label>
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

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="page">Loading…</div>}>
      <SubmitForm />
    </Suspense>
  );
}
