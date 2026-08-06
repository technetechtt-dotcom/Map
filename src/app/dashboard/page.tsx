"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Analytics = {
  totals: Record<string, number>;
  byCategory: { name: string; count: number }[];
  byProvince: { name: string; count: number }[];
  recentAudit: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    user?: { name: string } | null;
  }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(async (r) => {
        if (!r.ok) throw new Error("Sign in as admin to view full analytics");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="page">
        <h1>Provincial dashboards</h1>
        <p className="text-muted">{error}. Public summary is available after login at <a className="text-g700" href="/login">/login</a>.</p>
      </div>
    );
  }

  if (!data) return <div className="page">Loading dashboard…</div>;

  return (
    <div className="page">
      <p className="eyebrow">Analytics</p>
      <h1>Provincial & national dashboard</h1>
      <div className="stat-grid mt-4">
        {Object.entries(data.totals).map(([k, v]) => (
          <div key={k} className="stat">
            <strong>{v}</strong>
            <span className="text-xs uppercase tracking-wide text-muted">{k}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="panel-card h-80">
          <h2 className="mb-3 font-bold">Locations by category</h2>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={data.byCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#128269" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel-card h-80">
          <h2 className="mb-3 font-bold">National coverage by province</h2>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={data.byProvince}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel-card mt-6">
        <h2 className="mb-3 font-bold">Recent audit activity</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {data.recentAudit.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.user?.name || "System"}</td>
                <td>{a.action}</td>
                <td>{a.entityType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
