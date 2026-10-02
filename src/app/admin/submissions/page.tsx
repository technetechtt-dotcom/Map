"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";

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
  const [filter, setFilter] = useState<string>("ALL");
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
    setMsg(r.ok ? `Submission marked as ${status}` : "Review update failed");
    load();
  }

  const filtered = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);

  return (
    <AdminShell>
      <p className="eyebrow">Moderation</p>
      <h1 className="mb-2 text-2xl font-extrabold">Community submissions</h1>
      <p className="text-muted text-sm mb-4">
        Review user-submitted listings. Approving a submission stages it as a draft entity for catalogue verification.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => {
          const count = st === "ALL" ? rows.length : rows.filter((r) => r.status === st).length;
          return (
            <button
              key={st}
              type="button"
              className={`chip ${filter === st ? "chip-active" : ""}`}
              onClick={() => setFilter(st)}
            >
              {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()} ({count})
            </button>
          );
        })}
      </div>

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
            {filtered.map((s) => (
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
                  {s.status === "PENDING" ? (
                    <>
                      <button className="chip chip-active" type="button" onClick={() => review(s.id, "APPROVED")}>Approve</button>
                      <button className="chip hover:bg-red-50 hover:text-red-700" type="button" onClick={() => review(s.id, "REJECTED")}>Reject</button>
                    </>
                  ) : (
                    <span className="text-xs text-muted">Reviewed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-4 text-muted">No submissions found matching filter.</p>}
      </div>
    </AdminShell>
  );
}
