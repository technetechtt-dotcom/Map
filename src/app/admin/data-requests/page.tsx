"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type Row = { id: string; type: string; status: string; requesterEmail: string; details?: string | null; dueAt?: string | null; identityVerified?: boolean; handledNotes?: string | null };

export default function AdminDataRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/dsar").then((r) => r.json()).then((d) => setRows(d.requests || []));
  }, []);
  async function update(id: string, status: string, extra: Record<string, unknown> = {}) {
    await fetch("/api/dsar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, handledNotes: notes[id], ...extra }),
    });
    const d = await fetch("/api/dsar").then((r) => r.json());
    setRows(d.requests || []);
  }
  return (
    <AdminShell>
      <p className="eyebrow">POPIA</p>
      <h1 className="mb-4 text-2xl font-extrabold">Data-subject requests</h1>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Type</th><th>Requester</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.type}</td>
                <td>{row.requesterEmail}</td>
                <td><span className="chip">{row.status}</span></td>
                <td><textarea className="field min-h-[60px]" value={notes[row.id] || row.handledNotes || ""} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })} /></td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip" type="button" onClick={() => update(row.id, "IN_PROGRESS", { identityVerified: true })}>Verify identity</button>
                  <ConfirmAction label="Close" tone="primary" requireReason onConfirm={(reason) => update(row.id, "CLOSED", { handledNotes: reason, responseNotes: reason })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
