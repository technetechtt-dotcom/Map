"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Batch = {
  id: string;
  source: string;
  status: string;
  rowCount: number;
  appliedCount: number;
  createdAt: string;
};

export default function OpsUploadsPanel() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

  function reload() {
    fetch("/api/admin/imports")
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d) => setBatches(d.batches || []))
      .catch(() => setBatches([]));
  }

  useEffect(() => {
    reload();
  }, []);

  async function uploadFile(file: File) {
    const body = new FormData();
    body.append("file", file);
    const r = await fetch("/api/uploads", { method: "POST", body });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(data.error || "Upload failed");
      return;
    }
    setLastFile(data.url || data.filename || file.name);
    setMsg(`Stored ${file.name}`);
  }

  async function stage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      body: JSON.stringify({ source: String(fd.get("source") || "ops-console"), rows }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Staged ${data.okCount}/${data.total} rows` : data.error || "Stage failed");
    reload();
  }

  async function apply(batchId: string) {
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
    <div>
      <h2 className="mb-2 text-lg font-extrabold">Uploads and imports</h2>
      <p className="text-muted mb-4 text-sm">
        Store images or documents, then stage JSON location rows as drafts. Full import desk:{" "}
        <Link className="font-semibold text-g700" href="/admin/imports">
          Import staging
        </Link>
        .
      </p>
      {msg && <p className="mb-3 text-sm font-semibold text-g700">{msg}</p>}
      <div className="panel-card mb-6 grid gap-3">
        <h3 className="text-base font-bold">File upload</h3>
        <input
          className="field"
          type="file"
          accept="image/*,.pdf,.csv,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
          }}
        />
        {lastFile && <p className="text-xs text-muted">Last object: {lastFile}</p>}
      </div>
      <form onSubmit={stage} className="panel-card mb-6 grid gap-3">
        <h3 className="text-base font-bold">Stage location JSON</h3>
        <label className="grid gap-1 text-sm font-semibold">
          Source label
          <input className="field" name="source" defaultValue="ops-console" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          JSON rows
          <textarea className="field min-h-[140px] font-mono text-xs" name="json" required placeholder='[{"name":"Example hub","summary":"…","latitude":-28.7,"longitude":24.7,"provinceSlug":"northern-cape"}]' />
        </label>
        <button className="btn" type="submit">
          Stage batch
        </button>
      </form>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Rows</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id}>
                <td>{batch.source}</td>
                <td>
                  <span className="chip">{batch.status}</span>
                </td>
                <td>
                  {batch.appliedCount}/{batch.rowCount}
                </td>
                <td>{new Date(batch.createdAt).toLocaleString()}</td>
                <td>
                  {batch.status !== "APPLIED" && (
                    <button className="chip chip-active" type="button" onClick={() => apply(batch.id)}>
                      Apply drafts
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.length === 0 && <p className="p-4 text-muted">No import batches yet.</p>}
      </div>
    </div>
  );
}
