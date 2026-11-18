"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmAction from "@/components/ConfirmAction";

type SubmissionRow = {
  id: string;
  type: string;
  status: string;
  trackingRef?: string | null;
  payload: Record<string, unknown>;
  notes?: string | null;
  reviewedNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  province?: { name: string; slug: string } | null;
  publishedUrl?: string | null;
};

const labels: Record<string, string> = {
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  UNDER_REVIEW: "Under review",
  NEEDS_INFORMATION: "Action required",
  DUPLICATE_SUSPECTED: "Duplicate check",
  VERIFIED: "Verified",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  REJECTED: "Declined",
  WITHDRAWN: "Withdrawn",
};

const finalStatuses = new Set(["PUBLISHED", "APPROVED", "REJECTED", "WITHDRAWN"]);

function titleOf(row: SubmissionRow) {
  return String(row.payload.title || row.payload.name || "Untitled submission");
}

export default function MySubmissionsPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/account/submissions", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error === "Unauthorized" ? "Sign in to view and manage your submissions." : data.error || "Could not load submissions");
      setRows([]);
    } else {
      setRows(data.submissions || []);
      setMessage(null);
    }
    setLoading(false);
  }

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    review: rows.filter((r) => ["SUBMITTED", "ASSIGNED", "UNDER_REVIEW", "DUPLICATE_SUSPECTED", "VERIFIED"].includes(r.status)).length,
    action: rows.filter((r) => r.status === "NEEDS_INFORMATION").length,
    published: rows.filter((r) => r.status === "PUBLISHED" || r.status === "APPROVED").length,
  }), [rows]);

  async function action(id: string, actionName: "resubmit" | "withdraw", additionalInfo?: string) {
    const res = await fetch("/api/account/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: actionName, additionalInfo }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? (actionName === "resubmit" ? "Additional information sent to Ops." : "Submission withdrawn.") : data.error || "Update failed");
    if (res.ok) {
      setResponses((current) => ({ ...current, [id]: "" }));
      await load();
    }
  }

  return (
    <div className="page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Stakeholder dashboard</p>
          <h1>My submissions</h1>
          <p className="text-muted">Track what you submitted, respond to Ops questions and open published records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/submit">+ New submission</Link>
          <Link className="btn btn-outline" href="/track">Track by reference</Link>
          <Link className="chip" href="/account">Account</Link>
        </div>
      </div>

      <div className="stat-grid mt-5">
        <div className="stat"><strong>{stats.total}</strong><span>Total</span></div>
        <div className="stat"><strong>{stats.review}</strong><span>In review</span></div>
        <div className="stat"><strong>{stats.action}</strong><span>Needs action</span></div>
        <div className="stat"><strong>{stats.published}</strong><span>Published</span></div>
      </div>

      {message && <p className="mt-4 rounded-xl border border-line bg-white p-3 text-sm font-semibold text-g700">{message}</p>}
      {loading && <p className="mt-5 text-muted">Loading submissions…</p>}

      <div className="mt-6 grid gap-4">
        {rows.map((row) => (
          <article key={row.id} className="panel-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${row.status === "NEEDS_INFORMATION" ? "chip-danger" : row.status === "PUBLISHED" ? "chip-active" : ""}`}>
                    {labels[row.status] || row.status}
                  </span>
                  <span className="chip">{row.type}</span>
                  {row.province?.name && <span className="chip">{row.province.name}</span>}
                </div>
                <h2 className="mt-2 text-lg font-bold">{titleOf(row)}</h2>
                <p className="text-xs text-muted">
                  Ref {row.trackingRef || row.id.slice(-8)} · submitted {new Date(row.createdAt).toLocaleDateString()}
                </p>
              </div>
              {row.publishedUrl && <Link className="btn btn-outline text-xs" href={row.publishedUrl}>View published record →</Link>}
            </div>

            {row.reviewedNotes && (
              <div className={`mt-4 rounded-xl border p-3 text-sm ${row.status === "NEEDS_INFORMATION" ? "border-amber-300 bg-amber-50" : "border-line bg-soft"}`}>
                <p className="font-bold">Ops review</p>
                <p className="mt-1">{row.reviewedNotes}</p>
              </div>
            )}

            {row.status === "NEEDS_INFORMATION" && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <h3 className="font-bold">More information is required</h3>
                <p className="mt-1 text-sm text-muted">Reply to the reviewer request. Your response will return this item to the Ops review queue.</p>
                <textarea
                  className="field mt-3 min-h-[100px]"
                  value={responses[row.id] || ""}
                  onChange={(e) => setResponses((current) => ({ ...current, [row.id]: e.target.value }))}
                  placeholder="Provide the requested details, links, corrections or context…"
                />
                <button className="btn mt-2" type="button" onClick={() => action(row.id, "resubmit", responses[row.id] || "")}>
                  Resubmit to Ops
                </button>
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-bold text-g700">Submission details</summary>
              <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                {Object.entries(row.payload || {}).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-soft p-2">
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted">{key.replace(/([A-Z])/g, " $1")}</dt>
                    <dd className="mt-1 break-words">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>

            {!finalStatuses.has(row.status) && row.status !== "NEEDS_INFORMATION" && (
              <div className="mt-4">
                <ConfirmAction label="Withdraw submission" requireReason={false} onConfirm={() => action(row.id, "withdraw")} />
              </div>
            )}
          </article>
        ))}
        {!loading && rows.length === 0 && (
          <div className="panel-card">
            <h2 className="font-bold">No submissions yet</h2>
            <p className="mt-1 text-sm text-muted">Add an organisation, funding opportunity, programme, event or procurement notice for Ops review.</p>
            <Link className="btn mt-4" href="/submit">Create first submission</Link>
          </div>
        )}
      </div>
    </div>
  );
}
