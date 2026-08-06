"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<{
    id: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    createdAt: string;
    user?: { name: string; email: string } | null;
  }[]>([]);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => setLogs(d.logs || []));
  }, []);

  return (
    <AdminShell>
      <p className="eyebrow">Compliance</p>
      <h1 className="mb-4 text-2xl font-extrabold">Audit log</h1>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.user?.name || "System"}</td>
                <td>{l.action}</td>
                <td>{l.entityType}</td>
                <td className="text-xs">{l.entityId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
