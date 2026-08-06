"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

type Batch = {
  id: string;
  source: string;
  status: string;
  rowCount: number;
  appliedCount: number;
  createdAt: string;
};

export default function AdminImportsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  function reload() {
    fetch("/api/admin/imports")
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d) => setBatches(d.batches || []))
      .catch(() => setBatches([]));
  }

  useEffect(() => {
    reload();
  }, []);

  async function stage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setReport(null);
    const fd = new FormData(e.currentTarget);
    const text = String(fd.get("json") || "").trim();
    let rows: unknown[];
    try {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : parsed.rows;
      if (!Array.isArray(rows)) throw new Error("JSON must be an array or { rows: [] }");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }
    const r = await fetch("/api/admin/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: String(fd.get("source") || "manual"),
        rows,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(data.error || "Stage failed");
      return;
    }
    setMsg(`Staged batch ${data.batchId}: ${data.okCount}/${data.total} rows clean`);
    setReport(JSON.stringify(data.report || [], null, 2));
    reload();
  }

  async function apply(batchId: string) {
    if (!confirm("Apply batch? Creates DRAFT locations only.")) return;
    const r = await fetch("/api/admin/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true, batchId }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Applied ${data.applied} drafts` : data.error || "Apply failed");
    reload();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Data</p>
      <h1 className="text-2xl font-extrabold">Import staging</h1>
      <p className="text-muted mb-4 max-w-2xl text-sm">
        Stage CSV-derived JSON rows for dry-run duplicate checks. Apply never auto-publishes — drafts
        require normal verification / publish workflow.
      </p>

      <form onSubmit={stage} className="panel-card grid gap-3 mb-6 max-w-3xl">
        <label className="grid gap-1 text-sm font-semibold">
          Source label
          <input className="field" name="source" defaultValue="national_csv" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Rows JSON
          <textarea
            className="field font-mono text-xs min-h-[160px]"
            name="json"
            required
            placeholder={`[\n  {\n    "name": "Example Hub",\n    "latitude": -28.7,\n    "longitude": 24.7,\n    "provinceSlug": "northern-cape",\n    "categorySlug": "hubs"\n  }\n]`}
          />
        </label>
        <button className="btn" type="submit">
          Stage &amp; preview
        </button>
      </form>

      {msg && <p className="text-sm font-semibold text-g700 mb-3">{msg}</p>}
      {report && (
        <pre className="panel-card text-xs overflow-auto max-h-64 mb-6">{report}</pre>
      )}

      <h2 className="font-bold mb-2">Recent batches</h2>
      <ul className="grid gap-2 max-w-3xl">
        {batches.map((b) => (
          <li key={b.id} className="panel-card flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <code className="text-xs">{b.id.slice(0, 10)}…</code> · {b.source} · {b.status} ·{" "}
              {b.rowCount} rows
              {b.status === "APPLIED" ? ` · applied ${b.appliedCount}` : ""}
            </span>
            {b.status === "STAGED" && (
              <button type="button" className="btn btn-outline text-xs" onClick={() => apply(b.id)}>
                Apply as drafts
              </button>
            )}
          </li>
        ))}
        {!batches.length && <li className="text-muted text-sm">No batches yet.</li>}
      </ul>
    </AdminShell>
  );
}
