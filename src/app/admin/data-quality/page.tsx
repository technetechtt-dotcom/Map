"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminDataQualityPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/data-quality");
    if (!res.ok) {
      setError("Unable to load data-quality KPIs");
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  const kpis = (data?.kpis || {}) as Record<string, number>;
  const queue = (data?.weeklyReviewQueue || []) as Array<{ kind: string; severity: string; code: string; message: string }>;
  const connectorHealth = (data?.connectorHealth || []) as Array<{ connector: string; health: string; startedAt: string }>;
  const provinces = (data?.provinceCoverage || []) as Array<{ code: string; name: string; coveragePct: number; organisations: number }>;

  return (
    <AdminShell>
      <p className="eyebrow">Operations</p>
      <h1>Data quality & province completeness</h1>
      <p className="text-muted mb-6">Weekly review queue, connector health, and province coverage targets.</p>
      {error && <p className="text-red-700">{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data && (
        <>
          <div className="stat-grid mb-6">
            <div className="stat"><strong>{kpis.coveragePct ?? 0}%</strong><span className="text-xs text-muted">Coverage</span></div>
            <div className="stat"><strong>{kpis.verifiedPct ?? 0}%</strong><span className="text-xs text-muted">Verified</span></div>
            <div className="stat"><strong>{kpis.currentPct ?? 0}%</strong><span className="text-xs text-muted">Current</span></div>
            <div className="stat"><strong>{kpis.multiSourceEntities ?? 0}</strong><span className="text-xs text-muted">Multi-source entities</span></div>
          </div>

          <section className="panel-card mb-6">
            <h2 className="text-lg font-bold">Weekly review queue</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {queue.length === 0 && <li className="text-muted">No escalations this week.</li>}
              {queue.map((item) => (
                <li key={item.code}>
                  <span className={`chip ${item.severity === "critical" ? "chip-active" : ""}`}>{item.severity}</span> {item.message}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-card mb-6 overflow-x-auto">
            <h2 className="text-lg font-bold">Connector health</h2>
            <table className="table mt-3">
              <thead><tr><th>Connector</th><th>Health</th><th>Last run</th></tr></thead>
              <tbody>
                {connectorHealth.map((c) => (
                  <tr key={c.connector}>
                    <td>{c.connector}</td>
                    <td>{c.health}</td>
                    <td>{new Date(c.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel-card overflow-x-auto">
            <h2 className="text-lg font-bold">Province completeness</h2>
            <table className="table mt-3">
              <thead><tr><th>Province</th><th>Coverage</th><th>Organisations</th></tr></thead>
              <tbody>
                {provinces.map((p) => (
                  <tr key={p.code}>
                    <td>{p.name}</td>
                    <td>{p.coveragePct}%</td>
                    <td>{p.organisations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="mt-6 text-sm">
            <Link href="/admin/review" className="text-g700 font-semibold">Open conflict resolution queue →</Link>
          </p>
        </>
      )}
    </AdminShell>
  );
}
