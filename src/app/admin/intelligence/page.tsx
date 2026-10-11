"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";

type ProvinceRow = {
  id: string;
  code: string;
  name: string;
  organisations: number;
  locations: number;
  funding: number;
  events: number;
  programmes: number;
  procurement: number;
  coverageGap: boolean;
};

type Intelligence = {
  kpis: {
    organisations: number;
    locations: number;
    verifiedOrgs: number;
    unverifiedPublished: number;
    verificationRate: number;
    skillsCapacity: number;
    infrastructureCoverage: number;
    fundingOpen: number;
    tenderActivity: number;
    startupDensity: number;
    staleLocations: number;
    pendingSubmissions: number;
    recentlyUpdatedLocations: number;
  };
  provinceComparisons: ProvinceRow[];
  coverageGaps: ProvinceRow[];
  connectorHealth: Array<{ id: string; authority: string; health: string; rows: number }>;
  staleAlerts: { staleLocations: number; degradedConnectors: string[]; seedOnlyConnectors: number };
  relationshipTypes: Array<{ type: string; _count: number }>;
};

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <span className="text-xs text-muted block mt-1">{hint}</span> : null}
    </div>
  );
}

export default function AdminIntelligencePage() {
  const [data, setData] = useState<Intelligence | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/intelligence")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || "Failed to load");
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const kpis = data?.kpis;

  return (
    <AdminShell>
      <p className="eyebrow">Ecosystem</p>
      <h1 className="mb-2 text-2xl font-extrabold">National intelligence</h1>
      <p className="text-muted mb-6">
        KPI dashboard for province coverage, ICT density, skills, infrastructure, funding, tenders, and connector health.
      </p>

      {error && <div className="panel-card text-red-700 mb-4">{error}</div>}
      {!data && !error && <div className="panel-card text-muted">Loading intelligence…</div>}

      {kpis && (
        <>
          <div className="stat-grid mb-6">
            <Kpi label="Published organisations" value={kpis.organisations} />
            <Kpi label="Published locations" value={kpis.locations} />
            <Kpi label="Verification quality" value={`${kpis.verificationRate}%`} hint={`${kpis.verifiedOrgs} verified / ${kpis.unverifiedPublished} unverified`} />
            <Kpi label="Skills capacity (programmes)" value={kpis.skillsCapacity} />
            <Kpi label="Infrastructure coverage" value={kpis.infrastructureCoverage} />
            <Kpi label="Open funding" value={kpis.fundingOpen} />
            <Kpi label="Tender activity" value={kpis.tenderActivity} />
            <Kpi label="Startup / incubator orgs" value={kpis.startupDensity} />
            <Kpi label="Stale-record alerts" value={kpis.staleLocations} />
            <Kpi label="Pending submissions" value={kpis.pendingSubmissions} />
            <Kpi label="Locations updated (30d)" value={kpis.recentlyUpdatedLocations} />
          </div>

          <section className="panel-card mb-6">
            <h2 className="text-lg font-bold mb-2">Province comparisons &amp; coverage gaps</h2>
            <p className="text-muted text-sm mb-4">
              Gaps highlight provinces below the interim floor (10 organisations or 5 locations).
              {data.coverageGaps.length ? ` ${data.coverageGaps.length} province(s) flagged.` : " No gaps at current thresholds."}
            </p>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>Orgs</th>
                    <th>Locations</th>
                    <th>Funding</th>
                    <th>Events</th>
                    <th>Programmes</th>
                    <th>Procurement</th>
                    <th>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.provinceComparisons || []).map((p) => (
                    <tr key={p.id} className={p.coverageGap ? "bg-amber-50/60" : undefined}>
                      <td className="font-semibold">{p.code} — {p.name}</td>
                      <td>{p.organisations}</td>
                      <td>{p.locations}</td>
                      <td>{p.funding}</td>
                      <td>{p.events}</td>
                      <td>{p.programmes}</td>
                      <td>{p.procurement}</td>
                      <td>{p.coverageGap ? <span className="chip text-xs">Coverage gap</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-card mb-6">
            <h2 className="text-lg font-bold mb-2">Connector health</h2>
            <p className="text-muted text-sm mb-4">
              {data.staleAlerts.seedOnlyConnectors} seed-only · {data.staleAlerts.degradedConnectors.length} degraded
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(data.connectorHealth || []).map((c) => (
                <div key={c.id} className="border border-black/5 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">{c.id}</strong>
                    <span className="chip text-xs">{c.health}</span>
                  </div>
                  <p className="text-xs text-muted mt-1">{c.authority}</p>
                  <p className="text-xs mt-1">{c.rows} rows in last run</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <h2 className="text-lg font-bold mb-2">Relationship mix</h2>
            {(data.relationshipTypes || []).length === 0 ? (
              <p className="text-muted text-sm">No published organisation relationships yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.relationshipTypes.map((r) => (
                  <li key={r.type} className="flex justify-between text-sm border-b border-black/5 py-2">
                    <span>{r.type}</span>
                    <strong>{r._count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}
