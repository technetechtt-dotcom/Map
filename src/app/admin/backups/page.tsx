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
      setResult(
        `Encrypted backup saved: ${data.backup?.filename} (${data.backup?.sizeBytes} bytes). Super-admin only. Set BACKUP_ENCRYPTION_KEY.`
      );
    } else {
      setResult(data.error || "Backup failed");
    }
  }

  return (
    <AdminShell>
      <p className="eyebrow">Resilience</p>
      <h1 className="mb-2 text-2xl font-extrabold">Encrypted backups</h1>
      <p className="text-muted mb-4 max-w-xl">
        Super-admin only. Creates an AES-256-GCM encrypted export (no password hashes) under{" "}
        <code>data/backups/*.enc</code>. Decrypt only via authenticated API with{" "}
        <code>?decrypt=1</code>. Production Postgres: also schedule{" "}
        <code>pg_dump</code> and test restore regularly.
      </p>
      <button className="btn" type="button" onClick={runBackup} disabled={loading}>
        {loading ? "Creating…" : "Create encrypted backup"}
      </button>
      {result && <p className="mt-4 font-semibold text-g700">{result}</p>}
    </AdminShell>
  );
}
