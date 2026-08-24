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
        Create, edit, verify and publish locations. Moderators review community submissions.
        User invites, imports and backups sit under Advanced.
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
        {canOps && <Link href="/admin/ops" className="btn">Operations</Link>}
        <Link href="/admin/locations" className="btn btn-outline">Manage locations</Link>
        {(role === "SUPER_ADMIN" || role === "PROVINCIAL_ADMIN") && (
          <Link href="/admin/submissions" className="btn btn-outline">Review submissions</Link>
        )}
      </div>
    </AdminShell>
  );
}
