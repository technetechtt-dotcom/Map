"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function RightsPage() {
  const [msg, setMsg] = useState<string | null>(null);

  async function onDsar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/dsar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: fd.get("type"),
        requesterName: fd.get("requesterName"),
        requesterEmail: fd.get("requesterEmail"),
        details: fd.get("details"),
        website: fd.get("website") || "",
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Request submitted (${data.id})` : data.error || "Failed");
    if (r.ok) e.currentTarget.reset();
  }

  async function onCorrection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: fd.get("targetType"),
        targetSlug: fd.get("targetSlug"),
        submitterName: fd.get("submitterName"),
        submitterEmail: fd.get("submitterEmail"),
        message: fd.get("message"),
        website: fd.get("website") || "",
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Correction request submitted (${data.id})` : data.error || "Failed");
    if (r.ok) e.currentTarget.reset();
  }

  return (
    <div className="page max-w-2xl">
      <p className="eyebrow">POPIA</p>
      <h1>Your data rights &amp; corrections</h1>
      <p className="text-muted mb-6 text-sm">
        Submit a data-subject request or propose a correction to a published listing. See{" "}
        <Link href="/privacy" className="text-g700 font-semibold">
          privacy notice
        </Link>
        .
      </p>

      <section className="panel-card mb-6 grid gap-3">
        <h2 className="font-bold">Data subject request</h2>
        <form onSubmit={onDsar} className="grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Request type
            <select className="field" name="type" required>
              <option value="access">Access</option>
              <option value="correction">Correction</option>
              <option value="deletion">Deletion</option>
              <option value="withdraw_consent">Withdraw consent</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Name
            <input className="field" name="requesterName" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Email
            <input className="field" name="requesterEmail" type="email" required />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Details
            <textarea className="field min-h-[100px]" name="details" />
          </label>
          <label className="absolute -left-[9999px]" aria-hidden>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="btn" type="submit">
            Submit request
          </button>
        </form>
      </section>

      <section className="panel-card grid gap-3">
        <h2 className="font-bold">Public listing correction</h2>
        <form onSubmit={onCorrection} className="grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Target type
            <select className="field" name="targetType" required>
              <option value="location">Location / town</option>
              <option value="organisation">Organisation</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Slug (if known)
            <input className="field" name="targetSlug" placeholder="e.g. kimberley" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Your name
            <input className="field" name="submitterName" required />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Your email
            <input className="field" name="submitterEmail" type="email" required />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            What should change?
            <textarea className="field min-h-[100px]" name="message" required minLength={10} />
          </label>
          <label className="absolute -left-[9999px]" aria-hidden>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="btn" type="submit">
            Submit correction
          </button>
        </form>
      </section>

      {msg && <p className="mt-4 font-semibold text-g700 text-sm">{msg}</p>}
    </div>
  );
}
