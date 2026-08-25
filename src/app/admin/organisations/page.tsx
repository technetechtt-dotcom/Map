"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  verified: boolean;
  status: string;
  verificationTier?: string | null;
  lastVerifiedAt?: string | Date | null;
  verificationExpiresAt?: string | Date | null;
};

export default function AdminOrganisationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/organisations?scope=manage");
    const d = await r.json().catch(() => ({}));
    setOrgs(d.organisations || []);
  }

  useEffect(() => {
    load().catch(() => setOrgs([]));
  }, []);

  async function setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, ...extra }),
    });
    if (r.ok) {
      setMessage(`${status} applied`);
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      setMessage(d.error || "Update failed");
    }
  }

  return (
    <AdminShell>
      <p className="eyebrow">Phase 3</p>
      <h1 className="mb-4 text-2xl font-extrabold">Organisation accounts</h1>
      {message && <p className="mb-3 text-sm text-muted">{message}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Tier</th>
              <th>Verified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className="font-semibold">{o.name}</div>
                  <div className="text-xs text-muted">{o.slug}</div>
                </td>
                <td>{o.type}</td>
                <td><span className="chip">{o.status}</span></td>
                <td>{o.verificationTier || "unverified"}</td>
                <td>{o.verified ? "Yes" : "No"}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="chip" type="button" onClick={() => setStatus(o.id, "VERIFIED", { verificationTier: "desktop" })}>
                    Desktop verify
                  </button>
                  <button className="chip" type="button" onClick={() => setStatus(o.id, "VERIFIED", { verificationTier: "field" })}>
                    Field verify
                  </button>
                  <button className="chip chip-active" type="button" onClick={() => setStatus(o.id, "PUBLISHED")}>
                    Publish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
