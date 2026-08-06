"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminOrganisationsPage() {
  const [orgs, setOrgs] = useState<{
    id: string; name: string; slug: string; type: string; verified: boolean; status: string;
  }[]>([]);

  useEffect(() => {
    fetch("/api/organisations")
      .then((r) => r.json())
      .then((d) => setOrgs(d.organisations || []))
      .catch(() => setOrgs([]));
  }, []);

  return (
    <AdminShell>
      <p className="eyebrow">Phase 3</p>
      <h1 className="mb-4 text-2xl font-extrabold">Organisation accounts</h1>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Verified</th>
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
                <td>{o.verified ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
