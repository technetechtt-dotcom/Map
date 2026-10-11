"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type Submission = {
  id: string;
  type: string;
  status: string;
  trackingRef?: string | null;
  submitterName: string;
  submitterEmail: string;
  createdAt: string;
  payload: Record<string, unknown>;
  createdEntityId?: string | null;
  createdEntityType?: string | null;
};

const STATUSES = ["SUBMITTED", "ASSIGNED", "UNDER_REVIEW", "NEEDS_INFORMATION", "DUPLICATE_SUSPECTED", "VERIFIED", "PUBLISHED", "APPROVED", "REJECTED"];

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});

  async function load() {
    const r = await fetch("/api/submissions");
    if (!r.ok) return;
    const data = await r.json();
    setRows(data.submissions || []);
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, status: string) {
    const r = await fetch("/api/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reviewedNotes: comment[id] || "" }),
    });
    setMsg(r.ok ? `Submission marked as ${status}` : "Review update failed");
    load();
  }

  const filtered = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);

  return (
    <AdminShell>
      <p className="eyebrow">Moderation</p>
      <h1 className="mb-2 text-2xl font-extrabold">Community submissions</h1>
      <p className="text-muted text-sm mb-4">Assign reviewers, request information, flag duplicates, verify and publish. Approving stages a draft catalogue record.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((st) => (
          <button key={st} type="button" className={`chip ${filter === st ? "chip-active" : ""}`} onClick={() => setFilter(st)}>
            {st} ({st === "ALL" ? rows.length : rows.filter((r) => r.status === st).length})
          </button>
        ))}
      </div>
      {msg && <p className="mb-3 text-sm font-semibold text-g700">{msg}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Ref</th>
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
                <td className="font-semibold">{s.trackingRef || s.id.slice(-6)}</td>
                <td>
                  <div className="font-semibold">{s.submitterName}</div>
                  <div className="text-xs text-muted">{s.submitterEmail}</div>
                </td>
                <td>{s.type}</td>
                <td className="max-w-xs truncate text-xs">{JSON.stringify(s.payload)}</td>
                <td><span className="chip">{s.status}</span></td>
                <td className="space-y-1">
                  <textarea className="field min-h-[60px]" placeholder="Reviewer comment" value={comment[s.id] || ""} onChange={(e) => setComment({ ...comment, [s.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-1">
                    <button className="chip" type="button" onClick={() => review(s.id, "ASSIGNED")}>Assign</button>
                    <button className="chip" type="button" onClick={() => review(s.id, "UNDER_REVIEW")}>Under review</button>
                    <button className="chip" type="button" onClick={() => review(s.id, "NEEDS_INFORMATION")}>Need info</button>
                    <button className="chip" type="button" onClick={() => review(s.id, "DUPLICATE_SUSPECTED")}>Duplicate</button>
                    <ConfirmAction label="Approve" tone="primary" onConfirm={() => review(s.id, "APPROVED")} />
                    <ConfirmAction label="Reject" requireReason onConfirm={(reason) => { setComment({ ...comment, [s.id]: reason }); return review(s.id, "REJECTED"); }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
