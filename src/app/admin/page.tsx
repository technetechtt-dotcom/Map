"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Link from "next/link";

export default function AdminHome() {
  const [data, setData] = useState<{
    totals: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <AdminShell>
      <p className="eyebrow">Phase 2</p>
      <h1 className="text-2xl font-extrabold">Management system</h1>
      <p className="text-muted mb-4 max-w-2xl">
        Create, edit, verify and publish locations; moderate community submissions; manage organisation accounts,
        provincial roles, audit logs and backups.
      </p>
      {data && (
        <div className="stat-grid">
          {Object.entries(data.totals).slice(0, 8).map(([k, v]) => (
            <div key={k} className="stat">
              <strong>{v}</strong>
              <span className="text-xs uppercase tracking-wide text-muted">{k}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/locations" className="btn">Manage locations</Link>
        <Link href="/admin/submissions" className="btn btn-outline">Review submissions</Link>
        <Link href="/admin/backups" className="btn btn-outline">Create backup</Link>
      </div>
    </AdminShell>
  );
}
