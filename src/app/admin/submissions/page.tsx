"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type Match = { id: string; slug: string; title: string; kind: string };
type Reviewer = { id: string; name: string; email: string; role: string };
type Submission = {
  id: string;
  type: string;
  status: string;
  trackingRef?: string | null;
  submitterName: string;
  submitterEmail: string;
  createdAt: string;
  payload: Record<string, unknown>;
  assignedToId?: string | null;
  mergeTargetId?: string | null;
  duplicates?: Match[];
};

const STATUSES = ["SUBMITTED", "ASSIGNED", "UNDER_REVIEW", "NEEDS_INFORMATION", "DUPLICATE_SUSPECTED", "VERIFIED", "PUBLISHED", "APPROVED", "REJECTED"];

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});

  async function load() {
    const r = await fetch("/api/submissions");
    if (!r.ok) return;
    const data = await r.json();
    setRows(data.submissions || []);
    setReviewers(data.reviewers || []);
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, status: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status,
        reviewedNotes: comment[id] || "",
        assignedToId: assignee[id] || undefined,
        mergeTargetId: mergeTarget[id] || undefined,
        ...extra,
      }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Submission marked as ${status}` : data.error || "Review update failed");
    load();
  }

  const filtered = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);

  return (
    <AdminShell>
      <p className="eyebrow">Moderation</p>
      <h1 className="mb-2 text-2xl font-extrabold">Community submissions</h1>
      <p className="text-muted text-sm mb-4">Assign reviewers, request information, compare duplicates, merge into existing records, verify and publish.</p>
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
              <th>Type / payload</th>
              <th>Reviewer</th>
              <th>Duplicates</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="font-semibold">{s.trackingRef || s.id.slice(-6)}</div>
                  <span className="chip text-xs">{s.status}</span>
                </td>
                <td>
                  <div className="font-semibold">{s.submitterName}</div>
                  <div className="text-xs text-muted">{s.submitterEmail}</div>
                </td>
                <td className="max-w-xs">
                  <div className="font-semibold">{s.type}</div>
                  <div className="truncate text-xs text-muted">{JSON.stringify(s.payload)}</div>
                </td>
                <td>
                  <select
                    className="field text-sm"
                    value={assignee[s.id] || s.assignedToId || ""}
                    onChange={(e) => setAssignee({ ...assignee, [s.id]: e.target.value })}
                  >
                    <option value="">Select reviewer</option>
                    {reviewers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
                    ))}
                  </select>
                </td>
                <td className="min-w-[12rem]">
                  {(s.duplicates || []).length === 0 ? (
                    <span className="text-xs text-muted">No close matches</span>
                  ) : (
                    <select
                      className="field text-sm"
                      value={mergeTarget[s.id] || s.mergeTargetId || ""}
                      onChange={(e) => setMergeTarget({ ...mergeTarget, [s.id]: e.target.value })}
                    >
                      <option value="">Compare / choose merge target</option>
                      {(s.duplicates || []).map((m) => (
                        <option key={m.id} value={m.id}>{m.kind}: {m.title}</option>
                      ))}
                    </select>
                  )}
                  {(s.duplicates || []).slice(0, 2).map((m) => (
                    <div key={m.id} className="mt-1 text-xs text-muted">{m.kind} · {m.slug}</div>
                  ))}
                </td>
                <td className="space-y-1">
                  <textarea className="field min-h-[60px]" placeholder="Reviewer comment" value={comment[s.id] || ""} onChange={(e) => setComment({ ...comment, [s.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-1">
                    <button className="chip" type="button" onClick={() => review(s.id, "ASSIGNED", { assignedToId: assignee[s.id] || s.assignedToId })}>Assign</button>
                    <button className="chip" type="button" onClick={() => review(s.id, "UNDER_REVIEW")}>Under review</button>
                    <button className="chip" type="button" onClick={() => review(s.id, "NEEDS_INFORMATION")}>Need info</button>
                    <button className="chip" type="button" onClick={() => review(s.id, "DUPLICATE_SUSPECTED")}>Flag duplicate</button>
                    {(mergeTarget[s.id] || s.mergeTargetId) && (
                      <ConfirmAction
                        label="Merge fields into existing"
                        tone="primary"
                        requireReason
                        onConfirm={(reason) => {
                          setComment({ ...comment, [s.id]: reason });
                          return review(s.id, "APPROVED", { mergeTargetId: mergeTarget[s.id] || s.mergeTargetId, reviewedNotes: reason });
                        }}
                      />
                    )}
                    <ConfirmAction label="Approve new" tone="primary" onConfirm={() => review(s.id, "APPROVED")} />
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
