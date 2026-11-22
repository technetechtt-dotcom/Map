"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Group = { id: string; name: string };
type DocumentRow = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  visibility: string;
  version: number;
  createdAt: string;
  storedObject: { url: string; filename: string; contentType: string; sizeBytes: number };
  uploadedBy: { name: string };
  groups: Group[];
};

export default function RepositoryPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const [docsRes, groupsRes] = await Promise.all([
      fetch(`/api/repository${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" }),
      fetch("/api/repository/groups", { cache: "no-store" }),
    ]);
    if (docsRes.ok) {
      const data = await docsRes.json();
      setDocuments(data.documents || []);
    }
    if (groupsRes.ok) {
      const data = await groupsRes.json();
      setGroups(data.groups || []);
    }
  }, [q]);

  useEffect(() => {
    load().catch(() => setMessage("Could not load repository"));
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      setMessage("Choose a document to upload.");
      setBusy(false);
      return;
    }

    try {
      const upload = new FormData();
      upload.set("file", file);
      upload.set("access", "private");
      const uploadRes = await fetch("/api/uploads", { method: "POST", body: upload });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploaded.error || "Upload failed");

      const selectedGroups = form.getAll("groupIds").map(String);
      const visibility = String(form.get("visibility") || "GROUPS");
      const createRes = await fetch("/api/repository", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storedObjectId: uploaded.id,
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          category: String(form.get("category") || ""),
          tags: String(form.get("tags") || "").split(",").map((v) => v.trim()).filter(Boolean),
          visibility,
          groupIds: selectedGroups,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "Could not register document");

      event.currentTarget.reset();
      setMessage("Document uploaded to the stakeholder repository.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <p className="eyebrow">Stakeholder portal</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Innovation Repository</h1>
          <p className="mt-2 max-w-3xl text-muted">
            Securely share innovation resources, reports and working documents with authorised stakeholder groups.
          </p>
        </div>
        <Link href="/account" className="btn btn-outline">Account</Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="panel-card">
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              className="field min-w-56 flex-1"
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search repository…"
              aria-label="Search repository"
            />
          </div>
          <div className="space-y-3">
            {documents.map((document) => (
              <article key={document.id} className="rounded-xl border border-line/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-g700">{document.title}</h2>
                    <p className="text-xs text-muted">
                      Version {document.version} · {new Date(document.createdAt).toLocaleDateString()} · {document.uploadedBy.name}
                    </p>
                  </div>
                  <span className="chip">{document.category || "Document"}</span>
                </div>
                {document.description && <p className="mt-2 text-sm">{document.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1">
                  {document.groups.map((group) => <span key={group.id} className="chip">{group.name}</span>)}
                  {document.visibility !== "GROUPS" && <span className="chip">{document.visibility.replaceAll("_", " ")}</span>}
                </div>
                <a className="mt-3 inline-block text-sm font-semibold text-g700" href={document.storedObject.url}>
                  View / download document →
                </a>
              </article>
            ))}
            {documents.length === 0 && <p className="text-muted">No documents are available in your permitted groups yet.</p>}
          </div>
        </section>

        <aside className="panel-card">
          <h2 className="text-lg font-bold">Upload document</h2>
          <p className="mt-1 text-sm text-muted">Files remain private and are checked before storage.</p>
          <form className="mt-4 grid gap-3" onSubmit={submit}>
            <label className="text-sm font-semibold">Title
              <input className="field mt-1 w-full" name="title" required maxLength={180} />
            </label>
            <label className="text-sm font-semibold">Description
              <textarea className="field mt-1 min-h-24 w-full" name="description" />
            </label>
            <label className="text-sm font-semibold">Category
              <input className="field mt-1 w-full" name="category" placeholder="Report, Strategy, Minutes, Research…" />
            </label>
            <label className="text-sm font-semibold">Tags
              <input className="field mt-1 w-full" name="tags" placeholder="funding, skills, Kimberley" />
            </label>
            <label className="text-sm font-semibold">Document
              <input className="field mt-1 w-full" name="file" type="file" required accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.gif" />
            </label>
            <label className="text-sm font-semibold">Access
              <select className="field mt-1 w-full" name="visibility" defaultValue={groups.length ? "GROUPS" : "ORGANISATION"}>
                <option value="GROUPS">Selected stakeholder groups</option>
                <option value="ORGANISATION">My organisation</option>
                <option value="PROVINCE">Province stakeholders (admin)</option>
                <option value="ALL_STAKEHOLDERS">All signed-in stakeholders (admin)</option>
              </select>
            </label>
            {groups.length > 0 && (
              <fieldset>
                <legend className="text-sm font-semibold">Stakeholder groups</legend>
                <div className="mt-2 grid gap-2">
                  {groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="groupIds" value={group.id} />
                      {group.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <button className="btn" disabled={busy} type="submit">{busy ? "Uploading…" : "Upload securely"}</button>
          </form>
          {message && <p className="mt-3 text-sm font-semibold text-g700">{message}</p>}
        </aside>
      </div>
    </div>
  );
}
