"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Submission = {
  id: string;
  type: string;
  status: string;
  submitterName: string;
  submitterEmail: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export default function OpsContentPanel() {
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
    const reviewedNotes = status === "REJECTED" ? window.prompt("Rejection notes") || "" : "Approved from ops console";
    const r = await fetch("/api/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reviewedNotes }),
    });
    setMsg(r.ok ? status : "Failed");
    load();
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-extrabold">Content and listings</h2>
      <p className="text-muted mb-4 text-sm">
        Moderate community submissions, then publish funding, events, programmes and procurement from{" "}
        <Link className="font-semibold text-g700" href="/admin/ecosystem">
          Ecosystem records
        </Link>{" "}
        or{" "}
        <Link className="font-semibold text-g700" href="/admin/organisations">
          Organisations
        </Link>
        .
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="btn" href="/admin/ecosystem">
          Manage ecosystem records
        </Link>
        <Link className="btn btn-outline" href="/admin/organisations">
          Manage organisations
        </Link>
        <Link className="btn btn-outline" href="/admin/review">
          Review queue
        </Link>
      </div>
      {msg && <p className="mb-3 text-sm font-semibold text-g700">{msg}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Submitter</th>
              <th>Type</th>
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
                  <div className="max-w-xs truncate text-xs text-muted">{String(s.payload?.title || s.payload?.name || "")}</div>
                </td>
                <td>
                  <span className="chip">{s.status}</span>
                </td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip chip-active" type="button" onClick={() => review(s.id, "APPROVED")}>
                    Approve
                  </button>
                  <button className="chip" type="button" onClick={() => review(s.id, "REJECTED")}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-muted">No submissions yet.</p>}
      </div>
    </div>
  );
}
