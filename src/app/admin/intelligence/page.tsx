"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";

export default function AdminIntelligencePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch("/api/admin/intelligence").then((r) => r.json()).then(setData);
  }, []);
  return (
    <AdminShell>
      <p className="eyebrow">Ecosystem</p>
      <h1 className="mb-4 text-2xl font-extrabold">Intelligence</h1>
      <p className="text-muted mb-4">Gaps, stale data, underserved regions, coverage and relationship trends.</p>
      <pre className="panel-card overflow-x-auto text-xs">{JSON.stringify(data, null, 2)}</pre>
    </AdminShell>
  );
}
