"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import Link from "next/link";

type ReviewPayload = {
  duplicates: {
    id: string;
    slug: string;
    name: string;
    status: string;
    verificationTier: string;
    missingFromSource: boolean;
    consecutiveMisses: number;
  }[];
  missing: {
    id: string;
    slug: string;
    name: string;
    consecutiveMisses: number;
    lastObservedAt: string | null;
  }[];
  campaigns: {
    id: string;
    status: string;
    dueBefore: string;
    locationCount: number;
    organisationCount: number;
  }[];
  actions: {
    id: string;
    action: string;
    sourceId: string;
    targetId: string | null;
    createdAt: string;
  }[];
};

type QualityData = {
  kpis?: {
    coveragePct?: number;
    verifiedPct?: number;
    currentPct?: number;
    multiSourceEntities?: number;
  };
};

export default function AdminReviewPage() {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [review, kpis] = await Promise.all([
      fetch("/api/admin/review"),
      fetch("/api/admin/data-quality"),
    ]);
    if (review.ok) setData(await review.json());
    if (kpis.ok) setQuality(await kpis.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(action: "merge" | "reject-match" | "split" | "relink") {
    if (!sourceId) {
      setMessage("Source location ID is required.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sourceId, targetId: targetId || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    setMessage(res.ok ? `Action "${action}" recorded.` : body.error || "Action failed.");
    if (res.ok) {
      setSourceId("");
      setTargetId("");
      await load();
    }
  }

  const kpis = quality?.kpis;

  return (
    <AdminShell>
      <p className="eyebrow">Moderation</p>
      <h1 className="text-2xl font-extrabold mb-2">Review &amp; conflict queue</h1>
      <p className="text-muted mb-6 max-w-2xl text-sm">
        Merge, reject, split or re-link candidate duplicates. Missing-from-source records are queued
        and audited, not automatically deleted.
      </p>

      {kpis && (
        <div className="stat-grid mb-6">
          <div className="stat">
            <strong>{kpis.coveragePct ?? 0}%</strong>
            <span className="text-xs uppercase tracking-wide text-muted">Coverage</span>
          </div>
          <div className="stat">
            <strong>{kpis.verifiedPct ?? 0}%</strong>
            <span className="text-xs uppercase tracking-wide text-muted">Verified</span>
          </div>
          <div className="stat">
            <strong>{kpis.currentPct ?? 0}%</strong>
            <span className="text-xs uppercase tracking-wide text-muted">Current</span>
          </div>
          <div className="stat">
            <strong>{kpis.multiSourceEntities ?? 0}</strong>
            <span className="text-xs uppercase tracking-wide text-muted">Multi-source</span>
          </div>
        </div>
      )}

      {message && <p className="mb-4 text-sm font-semibold text-g700">{message}</p>}

      <section className="panel-card mb-6">
        <h2 className="text-base font-bold mb-3">Resolution action</h2>
        <form onSubmit={(e) => e.preventDefault()} className="grid gap-3 max-w-xl">
          <label className="grid gap-1 text-sm font-semibold">
            Source location ID (duplicate / to be merged)
            <input
              className="field font-mono text-xs"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder="e.g. c0394b91-..."
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Target location ID (canonical / destination)
            <input
              className="field font-mono text-xs"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g. b8238f42-..."
            />
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              className="btn text-xs"
              disabled={loading || !sourceId}
              onClick={() => void submit("merge")}
            >
              Merge into target
            </button>
            <button
              type="button"
              className="btn btn-outline text-xs"
              disabled={loading || !sourceId}
              onClick={() => void submit("reject-match")}
            >
              Reject match
            </button>
            <button
              type="button"
              className="btn btn-outline text-xs"
              disabled={loading || !sourceId}
              onClick={() => void submit("split")}
            >
              Split
            </button>
            <button
              type="button"
              className="btn btn-outline text-xs"
              disabled={loading || !sourceId}
              onClick={() => void submit("relink")}
            >
              Re-link
            </button>
          </div>
        </form>
      </section>

      <section className="panel-card mb-6 overflow-x-auto">
        <h2 className="text-base font-bold mb-3">Pending / draft locations</h2>
        <table className="table text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Tier</th>
              <th>ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.duplicates || []).map((row) => (
              <tr key={row.id}>
                <td className="font-semibold">{row.name}</td>
                <td><span className="chip text-xs">{row.status}</span></td>
                <td>{row.verificationTier || "—"}</td>
                <td><code className="text-xs">{row.id.slice(0, 8)}…</code></td>
                <td className="space-x-1 whitespace-nowrap">
                  <button
                    type="button"
                    className="chip text-xs"
                    onClick={() => setSourceId(row.id)}
                  >
                    Set as Source
                  </button>
                  <button
                    type="button"
                    className="chip text-xs"
                    onClick={() => setTargetId(row.id)}
                  >
                    Set as Target
                  </button>
                  <Link
                    href={`/locations/${row.slug}`}
                    className="chip text-xs font-semibold text-g700"
                    target="_blank"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {(!data?.duplicates || data.duplicates.length === 0) && (
              <tr>
                <td colSpan={5} className="text-muted py-3 text-center">
                  No pending draft duplicates in queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel-card mb-6 overflow-x-auto">
        <h2 className="text-base font-bold mb-3">Missing from source queue</h2>
        <table className="table text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Consecutive misses</th>
              <th>Last observed</th>
              <th>ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.missing || []).map((row) => (
              <tr key={row.id}>
                <td className="font-semibold">{row.name}</td>
                <td>{row.consecutiveMisses} miss(es)</td>
                <td>{row.lastObservedAt ? new Date(row.lastObservedAt).toLocaleDateString() : "—"}</td>
                <td><code className="text-xs">{row.id.slice(0, 8)}…</code></td>
                <td>
                  <button
                    type="button"
                    className="chip text-xs"
                    onClick={() => setSourceId(row.id)}
                  >
                    Set as Source
                  </button>
                </td>
              </tr>
            ))}
            {(!data?.missing || data.missing.length === 0) && (
              <tr>
                <td colSpan={5} className="text-muted py-3 text-center">
                  No missing-from-source flags active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel-card overflow-x-auto">
        <h2 className="text-base font-bold mb-3">Re-verification campaigns</h2>
        <table className="table text-sm">
          <thead>
            <tr>
              <th>Status</th>
              <th>Locations</th>
              <th>Organisations</th>
              <th>Due before</th>
            </tr>
          </thead>
          <tbody>
            {(data?.campaigns || []).map((row) => (
              <tr key={row.id}>
                <td><span className="chip text-xs">{row.status}</span></td>
                <td>{row.locationCount}</td>
                <td>{row.organisationCount}</td>
                <td>{String(row.dueBefore).slice(0, 10)}</td>
              </tr>
            ))}
            {(!data?.campaigns || data.campaigns.length === 0) && (
              <tr>
                <td colSpan={4} className="text-muted py-3 text-center">
                  No re-verification campaigns active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
