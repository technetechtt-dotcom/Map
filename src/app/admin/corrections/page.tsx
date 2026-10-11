"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type Row = { id: string; targetType: string; targetSlug?: string | null; status: string; message: string; submitterEmail: string };

export default function AdminCorrectionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/corrections").then((r) => r.json()).then((d) => setRows(d.requests || []));
  }, []);
  async function update(id: string, status: string, extra: Record<string, unknown> = {}) {
    await fetch("/api/corrections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, ...extra }),
    });
    const d = await fetch("/api/corrections").then((r) => r.json());
    setRows(d.requests || []);
  }
  return (
    <AdminShell>
      <p className="eyebrow">Quality</p>
      <h1 className="mb-4 text-2xl font-extrabold">Correction requests</h1>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Target</th><th>Submitter</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.targetType} {row.targetSlug}</td>
                <td>{row.submitterEmail}</td>
                <td className="max-w-xs">{row.message}</td>
                <td><span className="chip">{row.status}</span></td>
                <td className="space-x-1">
                  <button className="chip" type="button" onClick={() => update(row.id, "IN_PROGRESS")}>Investigate</button>
                  <ConfirmAction label="Resolve" tone="primary" requireReason onConfirm={(resolution) => update(row.id, "CLOSED", { resolution, investigationNotes: resolution })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
