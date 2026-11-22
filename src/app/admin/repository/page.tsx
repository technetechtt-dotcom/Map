"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";

type Group = {
  id: string;
  name: string;
  description?: string | null;
  members: { user: { id: string; name: string; email: string } }[];
  _count: { documentAccess: number };
};

export default function RepositoryAdminPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/repository/groups", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load stakeholder groups");
    setGroups(data.groups || []);
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  async function manageMembers(group: Group) {
    const current = group.members.map((member) => member.user.email).join(", ");
    const raw = prompt("Member emails (comma separated)", current);
    if (raw === null) return;
    const memberEmails = raw.split(/[\n,;]/).map((email) => email.trim()).filter(Boolean);
    const response = await fetch(`/api/repository/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberEmails }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Stakeholder group membership updated." : data.error || "Could not update group");
    if (response.ok) await load();
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const memberEmails = String(form.get("memberEmails") || "")
      .split(/[\n,;]/)
      .map((email) => email.trim())
      .filter(Boolean);
    const response = await fetch("/api/repository/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        description: String(form.get("description") || ""),
        memberEmails,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Could not create group");
      return;
    }
    event.currentTarget.reset();
    setMessage("Stakeholder group created.");
    await load();
  }

  return (
    <AdminShell>
      <p className="eyebrow">Knowledge management</p>
      <h1 className="text-2xl font-extrabold">Stakeholder repository</h1>
      <p className="mb-6 max-w-3xl text-muted">
        Manage repository access groups used to restrict innovation documents to authorised stakeholders.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel-card overflow-x-auto">
          <h2 className="mb-3 font-bold">Stakeholder groups</h2>
          <table className="table">
            <thead><tr><th>Group</th><th>Members</th><th>Documents</th><th>Actions</th></tr></thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td><strong>{group.name}</strong>{group.description && <div className="text-xs text-muted">{group.description}</div>}</td>
                  <td>{group.members.length ? group.members.map((member) => member.user.name || member.user.email).join(", ") : "No members"}</td>
                  <td>{group._count.documentAccess}</td>
                  <td><button type="button" className="text-sm font-semibold text-g700" onClick={() => manageMembers(group)}>Manage members</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length === 0 && <p className="text-muted">No repository groups have been created.</p>}
        </section>

        <aside className="panel-card">
          <h2 className="font-bold">Create stakeholder group</h2>
          <form className="mt-4 grid gap-3" onSubmit={createGroup}>
            <label className="text-sm font-semibold">Group name
              <input className="field mt-1 w-full" name="name" required placeholder="Funding Partners" />
            </label>
            <label className="text-sm font-semibold">Description
              <textarea className="field mt-1 min-h-20 w-full" name="description" />
            </label>
            <label className="text-sm font-semibold">Member emails
              <textarea className="field mt-1 min-h-28 w-full" name="memberEmails" placeholder={"person@example.org\nmember@example.org"} />
            </label>
            <p className="text-xs text-muted">Members must already have active stakeholder accounts in the permitted provincial scope.</p>
            <button className="btn" type="submit">Create group</button>
          </form>
          {message && <p className="mt-3 text-sm font-semibold text-g700">{message}</p>}
        </aside>
      </div>
    </AdminShell>
  );
}
