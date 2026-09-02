"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

type Submission = {
  id: string;
  type: string;
  status: string;
  submitterName: string;
  submitterEmail: string;
  createdAt: string;
  payload: Record<string, unknown>;
  createdEntityId?: string | null;
  createdEntityType?: string | null;
  createdLocationId?: string | null;
};

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/submissions");
    if (!r.ok) return;
    const data = await r.json();
    setRows(data.submissions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, status: string) {
    const reviewedNotes = status === "REJECTED" ? prompt("Rejection notes") || "" : "Approved for draft import";
    const r = await fetch("/api/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reviewedNotes }),
    });
    setMsg(r.ok ? `${status}` : "Failed");
    load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Moderation</p>
      <h1 className="mb-4 text-2xl font-extrabold">Community submissions</h1>
      {msg && <p className="mb-3 text-sm font-semibold text-g700">{msg}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Submitter</th>
              <th>Type</th>
              <th>Payload</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td>
                  <div className="font-semibold">{s.submitterName}</div>
                  <div className="text-xs text-muted">{s.submitterEmail}</div>
                </td>
                <td>
                  <div className="font-semibold">{s.type}</div>
                  {s.createdEntityId && <div className="text-xs text-muted">{s.createdEntityType}: {s.createdEntityId}</div>}
                </td>
                <td className="max-w-xs truncate text-xs">{JSON.stringify(s.payload)}</td>
                <td><span className="chip">{s.status}</span></td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip chip-active" type="button" onClick={() => review(s.id, "APPROVED")}>Approve</button>
                  <button className="chip" type="button" onClick={() => review(s.id, "REJECTED")}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">No submissions yet.</p>}
      </div>
    </AdminShell>
  );
}
