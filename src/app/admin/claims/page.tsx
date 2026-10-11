"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type Claim = { id: string; status: string; notes?: string | null; organisation?: { name: string; slug: string }; claimant?: { email: string; name: string } };

export default function AdminClaimsPage() {
  const [rows, setRows] = useState<Claim[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/organisations/claims");
    const data = await res.json();
    setRows(data.claims || []);
  }
  useEffect(() => { load().catch(() => setRows([])); }, []);

  async function decide(id: string, status: string, notes: string) {
    const res = await fetch("/api/organisations/claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, notes }),
    });
    setMessage(res.ok ? `Claim ${status}` : "Update failed");
    load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Ownership</p>
      <h1 className="mb-4 text-2xl font-extrabold">Organisation claims</h1>
      {message && <p className="mb-3 text-sm text-muted">{message}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Organisation</th><th>Claimant</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.organisation?.name || row.id}</td>
                <td>{row.claimant?.email || "—"}</td>
                <td><span className="chip">{row.status}</span></td>
                <td className="space-x-1">
                  {row.status === "PENDING" && (
                    <>
                      <ConfirmAction label="Approve" tone="primary" requireReason onConfirm={(notes) => decide(row.id, "APPROVED", notes)} />
                      <ConfirmAction label="Reject" requireReason onConfirm={(notes) => decide(row.id, "REJECTED", notes)} />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
