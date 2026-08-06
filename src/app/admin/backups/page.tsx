"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminBackupsPage() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runBackup() {
    setLoading(true);
    setResult(null);
    const r = await fetch("/api/admin/backups", { method: "POST" });
    const data = await r.json().catch(() => ({}));
    setLoading(false);
    if (r.ok) {
      setResult(`Backup saved: ${data.backup?.filename} (${data.backup?.sizeBytes} bytes)`);
    } else {
      setResult(data.error || "Backup failed");
    }
  }

  return (
    <AdminShell>
      <p className="eyebrow">Resilience</p>
      <h1 className="mb-2 text-2xl font-extrabold">Backups</h1>
      <p className="text-muted mb-4 max-w-xl">
        Exports locations, users (no passwords), organisations, ecosystem content, submissions, settings and recent audits
        into <code>data/backups/</code>. For PostgreSQL production, also schedule <code>pg_dump</code>.
      </p>
      <button className="btn" type="button" onClick={runBackup} disabled={loading}>
        {loading ? "Creating…" : "Create backup now"}
      </button>
      {result && <p className="mt-4 font-semibold text-g700">{result}</p>}
    </AdminShell>
  );
}
