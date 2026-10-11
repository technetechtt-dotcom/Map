"use client";

import { FormEvent, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function ClaimOrganisationForm({
  organisationId,
  organisationName,
}: {
  organisationId: string;
  organisationName: string;
}) {
  const { status } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const fd = new FormData(event.currentTarget);
    const res = await fetch("/api/organisations/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId,
        notes: String(fd.get("notes") || ""),
        evidence: [{ title: String(fd.get("evidenceTitle") || "Ownership evidence"), url: String(fd.get("evidenceUrl") || "") || undefined }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setMessage(res.ok ? "Claim submitted for review." : data.error || "Claim failed");
  }

  return (
    <section className="panel-card mt-8 max-w-xl">
      <h2 className="mb-2 text-lg font-bold">Claim this organisation</h2>
      <p className="mb-3 text-sm text-muted">
        Request ownership of {organisationName}. Approved claimants become organisation administrators after review.
      </p>
      {status !== "authenticated" ? (
        <p className="text-sm">
          <Link className="font-semibold text-g700" href="/login">Sign in</Link> to submit a claim.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Evidence title
            <input className="field" name="evidenceTitle" required defaultValue="Official letter / website" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Evidence URL
            <input className="field" name="evidenceUrl" type="url" placeholder="https://" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Notes
            <textarea className="field min-h-[80px]" name="notes" />
          </label>
          <button className="btn" type="submit" disabled={loading}>{loading ? "Submitting…" : "Submit claim"}</button>
          {message && <p className="text-sm text-muted">{message}</p>}
        </form>
      )}
    </section>
  );
}
