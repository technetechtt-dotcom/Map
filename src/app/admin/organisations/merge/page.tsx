"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import ConfirmAction from "@/components/ConfirmAction";

type Org = { id: string; name: string; slug: string; type: string; status: string; website?: string | null; email?: string | null };

export default function AdminMergePage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/organisations?scope=manage").then((r) => r.json()).then((d) => setOrgs(d.organisations || []));
  }, []);
  const source = orgs.find((o) => o.id === sourceId);
  const target = orgs.find((o) => o.id === targetId);
  return (
    <AdminShell>
      <p className="eyebrow">Duplicates</p>
      <h1 className="mb-4 text-2xl font-extrabold">Merge organisations</h1>
      <div className="panel-card grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Duplicate (source)
          <select className="field" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Select</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Keep (target)
          <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      {source && target && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[source, target].map((org, i) => (
            <article key={org.id} className="panel-card">
              <h2 className="font-bold">{i === 0 ? "Will archive" : "Will keep"}: {org.name}</h2>
              <p className="text-sm text-muted">{org.type} · {org.status}</p>
              <p className="text-sm">{org.website || "No website"}</p>
              <p className="text-sm">{org.email || "No email"}</p>
            </article>
          ))}
          <ConfirmAction label="Merge duplicate" requireReason onConfirm={async (reason) => {
            const res = await fetch("/api/organisations/merge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sourceId, targetId, reason }),
            });
            setMessage(res.ok ? "Merge completed. Source is archived and can be inspected in audit history." : "Merge failed");
          }} />
        </div>
      )}
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </AdminShell>
  );
}
