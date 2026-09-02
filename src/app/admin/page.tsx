"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function AdminHome() {
  const { data: session } = useSession();
  const role = String((session?.user as { role?: string } | undefined)?.role || "");
  const canOps = role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN";
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
      <p className="eyebrow">Administration</p>
      <h1 className="text-2xl font-extrabold">Management system</h1>
      <p className="text-muted mb-4 max-w-2xl">
        Super and provincial operators run the platform from Operations: upload sites, moderate
        content, manage users, and watch health. This overview is a short catalogue snapshot.
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
        {canOps && <Link href="/admin/ops" className="btn">Open ops console</Link>}
        <Link href="/admin/locations" className="btn btn-outline">Manage locations</Link>
        {(role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN") && (
          <Link href="/admin/submissions" className="btn btn-outline">Review submissions</Link>
        )}
      </div>
    </AdminShell>
  );
}
