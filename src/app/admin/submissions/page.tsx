"use client";

import { useEffect, useMemo, useState } from "react";
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
  notes?: string | null;
  reviewedNotes?: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
  assignedToId?: string | null;
  mergeTargetId?: string | null;
  duplicates?: Match[];
};

const STATUSES = [
  "SUBMITTED",
  "ASSIGNED",
  "UNDER_REVIEW",
  "NEEDS_INFORMATION",
  "DUPLICATE_SUSPECTED",
  "VERIFIED",
  "PUBLISHED",
  "REJECTED",
  "WITHDRAWN",
];

const labels: Record<string, string> = {
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  UNDER_REVIEW: "Under review",
  NEEDS_INFORMATION: "Needs information",
  DUPLICATE_SUSPECTED: "Duplicate check",
  VERIFIED: "Verified",
  PUBLISHED: "Published",
  APPROVED: "Approved",
  REJECTED: "Declined",
  WITHDRAWN: "Withdrawn",
};

const finalStatuses = new Set(["PUBLISHED", "REJECTED", "WITHDRAWN"]);

function titleOf(row: Submission) {
  return String(row.payload.title || row.payload.name || "Untitled submission");
}

function valueText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value ?? "");
}

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});

  async function load() {
    const r = await fetch("/api/submissions", { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(data.error || "Could not load submission queue");
      return;
    }
    setRows(data.submissions || []);
    setReviewers(data.reviewers || []);
  }
  useEffect(() => { load().catch(() => setMsg("Could not load submission queue")); }, []);

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
    setMsg(r.ok ? `Submission updated: ${labels[status] || status}` : data.error || "Review update failed");
    if (r.ok) await load();
  }

  const filtered = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);
  const stats = useMemo(() => ({
    waiting: rows.filter((r) => ["SUBMITTED", "ASSIGNED", "UNDER_REVIEW", "DUPLICATE_SUSPECTED"].includes(r.status)).length,
    needsInfo: rows.filter((r) => r.status === "NEEDS_INFORMATION").length,
    verified: rows.filter((r) => r.status === "VERIFIED").length,
    published: rows.filter((r) => r.status === "PUBLISHED").length,
  }), [rows]);

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Stakeholder moderation</p>
          <h1 className="text-2xl font-extrabold">Submission review queue</h1>
          <p className="mt-1 text-sm text-muted">
            Review organisations, funding, programmes, events and procurement notices before anything becomes public.
          </p>
        </div>
      </div>

      <div className="stat-grid mt-5">
        <div className="stat"><strong>{stats.waiting}</strong><span>Awaiting review</span></div>
        <div className="stat"><strong>{stats.needsInfo}</strong><span>Needs information</span></div>
        <div className="stat"><strong>{stats.verified}</strong><span>Verified / ready</span></div>
        <div className="stat"><strong>{stats.published}</strong><span>Published</span></div>
      </div>

      <div className="my-5 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((st) => (
          <button key={st} type="button" className={`chip ${filter === st ? "chip-active" : ""}`} onClick={() => setFilter(st)}>
            {st === "ALL" ? "All" : labels[st] || st} ({st === "ALL" ? rows.length : rows.filter((r) => r.status === st).length})
          </button>
        ))}
      </div>

      {msg && <p className="mb-4 rounded-xl border border-line bg-white p-3 text-sm font-semibold text-g700">{msg}</p>}

      <div className="grid gap-4">
        {filtered.map((s) => {
          const selectedTarget = mergeTarget[s.id] || s.mergeTargetId || "";
          const active = !finalStatuses.has(s.status);
          return (
            <article key={s.id} className="panel-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`chip ${s.status === "NEEDS_INFORMATION" ? "chip-danger" : s.status === "PUBLISHED" ? "chip-active" : ""}`}>
                      {labels[s.status] || s.status}
                    </span>
                    <span className="chip">{s.type}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold">{titleOf(s)}</h2>
                  <p className="text-xs text-muted">
                    Ref {s.trackingRef || s.id.slice(-8)} · {s.submitterName} · {s.submitterEmail} · {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div>
                  <details open={s.status === "SUBMITTED" || s.status === "NEEDS_INFORMATION"} className="rounded-xl border border-line p-3">
                    <summary className="cursor-pointer font-bold text-g700">Submitted information</summary>
                    <dl className="mt-3 grid gap-2 md:grid-cols-2">
                      {Object.entries(s.payload || {}).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-soft p-2 text-sm">
                          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{key.replace(/([A-Z])/g, " $1")}</dt>
                          <dd className="mt-1 break-words">{valueText(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>

                  {s.notes && (
                    <div className="mt-3 rounded-xl border border-line bg-soft p-3 text-sm">
                      <p className="font-bold">Stakeholder notes / responses</p>
                      <p className="mt-1 whitespace-pre-wrap">{s.notes}</p>
                    </div>
                  )}
                  {s.reviewedNotes && (
                    <div className="mt-3 rounded-xl border border-line p-3 text-sm">
                      <p className="font-bold">Last Ops review note</p>
                      <p className="mt-1 whitespace-pre-wrap">{s.reviewedNotes}</p>
                    </div>
                  )}
                </div>

                <div className="grid content-start gap-3">
                  <label className="grid gap-1 text-sm font-semibold">
                    Assigned reviewer
                    <select
                      className="field text-sm"
                      value={assignee[s.id] || s.assignedToId || ""}
                      disabled={!active}
                      onChange={(e) => setAssignee({ ...assignee, [s.id]: e.target.value })}
                    >
                      <option value="">Select reviewer</option>
                      {reviewers.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
                      ))}
                    </select>
                  </label>

                  {(s.duplicates || []).length > 0 && (
                    <label className="grid gap-1 text-sm font-semibold">
                      Possible duplicate / merge target
                      <select
                        className="field text-sm"
                        value={selectedTarget}
                        disabled={!active}
                        onChange={(e) => setMergeTarget({ ...mergeTarget, [s.id]: e.target.value })}
                      >
                        <option value="">Do not merge</option>
                        {(s.duplicates || []).map((m) => (
                          <option key={m.id} value={m.id}>{m.kind}: {m.title}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  {active && (
                    <>
                      <label className="grid gap-1 text-sm font-semibold">
                        Internal reviewer note
                        <textarea
                          className="field min-h-[80px]"
                          placeholder="Verification notes, source checks or internal context"
                          value={comment[s.id] || ""}
                          onChange={(e) => setComment({ ...comment, [s.id]: e.target.value })}
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button className="chip" type="button" onClick={() => review(s.id, "ASSIGNED", { assignedToId: assignee[s.id] || s.assignedToId })}>Assign</button>
                        <button className="chip" type="button" onClick={() => review(s.id, "UNDER_REVIEW")}>Under review</button>
                        <button className="chip" type="button" onClick={() => review(s.id, "VERIFIED")}>Mark verified</button>
                        <button className="chip" type="button" onClick={() => review(s.id, "DUPLICATE_SUSPECTED")}>Flag duplicate</button>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                        <ConfirmAction
                          label="Request information"
                          tone="warning"
                          requireReason
                          confirmLabel="Send request"
                          onConfirm={(reason) => review(s.id, "NEEDS_INFORMATION", { reviewedNotes: reason })}
                        />
                        {selectedTarget ? (
                          <ConfirmAction
                            label="Merge & publish"
                            tone="primary"
                            requireReason
                            confirmLabel="Merge and publish"
                            onConfirm={(reason) => review(s.id, "PUBLISHED", { mergeTargetId: selectedTarget, reviewedNotes: reason })}
                          />
                        ) : (
                          <ConfirmAction
                            label="Approve & publish"
                            tone="primary"
                            requireReason
                            confirmLabel="Publish"
                            onConfirm={(reason) => review(s.id, "PUBLISHED", { reviewedNotes: reason })}
                          />
                        )}
                        <ConfirmAction
                          label="Decline"
                          requireReason
                          confirmLabel="Decline submission"
                          onConfirm={(reason) => review(s.id, "REJECTED", { reviewedNotes: reason })}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && <div className="panel-card text-muted">No submissions in this queue.</div>}
      </div>
    </AdminShell>
  );
}
