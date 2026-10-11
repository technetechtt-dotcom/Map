"use client";

import { FormEvent, useState } from "react";

export default function TrackPage() {
  const [result, setResult] = useState<{ trackingRef?: string; status?: string; type?: string; updatedAt?: string; reviewerComment?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ref = String(new FormData(event.currentTarget).get("ref") || "");
    const res = await fetch(`/api/submissions/track?ref=${encodeURIComponent(ref)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Not found");
      setResult(null);
      return;
    }
    setError(null);
    setResult(data);
  }

  return (
    <div className="page max-w-xl">
      <p className="eyebrow">Community</p>
      <h1>Track a submission</h1>
      <p className="text-muted mb-4">Enter a reference such as ICT-2026-00452 to see review progress. Personal details are not shown.</p>
      <form onSubmit={onSubmit} className="panel-card grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Tracking reference
          <input className="field" name="ref" required placeholder="ICT-2026-00452" />
        </label>
        <button className="btn" type="submit">Check status</button>
        {error && <p className="text-sm text-muted">{error}</p>}
        {result && (
          <dl className="grid gap-2 text-sm">
            <div><dt className="text-muted">Reference</dt><dd className="font-semibold">{result.trackingRef}</dd></div>
            <div><dt className="text-muted">Type</dt><dd>{result.type}</dd></div>
            <div><dt className="text-muted">Status</dt><dd>{result.status}</dd></div>
            {result.reviewerComment && <div><dt className="text-muted">Reviewer comment</dt><dd>{result.reviewerComment}</dd></div>}
          </dl>
        )}
      </form>
    </div>
  );
}
