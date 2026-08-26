"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

type ReviewPayload = {
  duplicates: { id: string; slug: string; name: string; status: string; verificationTier: string; missingFromSource: boolean; consecutiveMisses: number }[];
  missing: { id: string; slug: string; name: string; consecutiveMisses: number; lastObservedAt: string | null }[];
  campaigns: { id: string; status: string; dueBefore: string; locationCount: number; organisationCount: number }[];
  actions: { id: string; action: string; sourceId: string; targetId: string | null; createdAt: string }[];
};

export default function AdminReviewPage() {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [quality, setQuality] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");

  async function load() {
    const [review, kpis] = await Promise.all([fetch("/api/admin/review"), fetch("/api/admin/data-quality")]);
    if (review.ok) setData(await review.json());
    if (kpis.ok) setQuality(await kpis.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent, action: "merge" | "reject-match" | "split" | "relink") {
    event.preventDefault();
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sourceId, targetId: targetId || undefined }),
    });
    const body = await res.json();
    setMessage(res.ok ? `${action} recorded` : body.error || "Failed");
    if (res.ok) await load();
  }

  return (
    <AdminShell>
      <h1>Review queue</h1>
      <p className="text-muted">Merge, reject, split or re-link possible duplicates. Missing-from-source records are queued, not deleted.</p>
      {message && <p>{message}</p>}
      {quality && (
        <pre className="text-sm overflow-auto">{JSON.stringify((quality as { kpis?: unknown }).kpis || quality, null, 2)}</pre>
      )}
      <form className="grid gap-2 max-w-xl my-4">
        <label>
          Source location id
          <input value={sourceId} onChange={(e) => setSourceId(e.target.value)} />
        </label>
        <label>
          Target location id
          <input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={(e) => void submit(e, "merge")}>Merge</button>
          <button type="button" onClick={(e) => void submit(e, "reject-match")}>Reject match</button>
          <button type="button" onClick={(e) => void submit(e, "split")}>Split</button>
          <button type="button" onClick={(e) => void submit(e, "relink")}>Re-link</button>
        </div>
      </form>
      <h2>Pending / draft locations</h2>
      <ul>
        {(data?.duplicates || []).map((row) => (
          <li key={row.id}>
            {row.name} ({row.status}, {row.verificationTier}) — {row.id}
          </li>
        ))}
      </ul>
      <h2>Missing from source</h2>
      <ul>
        {(data?.missing || []).map((row) => (
          <li key={row.id}>
            {row.name} — {row.consecutiveMisses} misses — {row.id}
          </li>
        ))}
      </ul>
      <h2>Re-verification campaigns</h2>
      <ul>
        {(data?.campaigns || []).map((row) => (
          <li key={row.id}>
            {row.status}: {row.locationCount} locations / {row.organisationCount} organisations by {String(row.dueBefore).slice(0, 10)}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
