"use client";

import { FormEvent, useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  province?: { name: string } | null;
  organisation?: { name: string } | null;
};

export default function OpsPeoplePanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "CONTRIBUTOR", password: "" });

  async function load() {
    const r = await fetch("/api/admin/users");
    if (!r.ok) {
      setMsg(r.status === 403 ? "Administrators only" : "Failed to load users");
      return;
    }
    const data = await r.json();
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 12) {
      setMsg("Password must be at least 12 characters");
      return;
    }
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setMsg(r.ok ? "User created (must change password on first login)" : "Create failed");
    if (r.ok) setForm({ email: "", name: "", role: "CONTRIBUTOR", password: "" });
    load();
  }

  async function inviteUser() {
    const email = window.prompt("Invite email");
    const role = window.prompt("Role", "PROVINCIAL_ADMIN");
    if (!email || !role) return;
    const r = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await r.json().catch(() => ({}));
    setMsg(r.ok && data.acceptPath ? `Invite created: ${data.acceptPath}` : data.error || "Invite failed");
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    setMsg(r.ok ? "User updated" : "Update failed");
    load();
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-extrabold">Users and roles</h2>
      <p className="text-muted mb-4 text-sm">Create operators, invite provincial admins, revoke sessions and disable accounts.</p>
      {msg && <p className="mb-3 text-sm font-semibold text-g700 break-all">{msg}</p>}
      <form onSubmit={createUser} className="panel-card mb-6 grid gap-3 md:grid-cols-2">
        <h3 className="md:col-span-2 text-base font-bold">Add user</h3>
        <label className="grid gap-1 text-sm font-semibold">
          Name
          <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Email
          <input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Role
          <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="CONTRIBUTOR">CONTRIBUTOR</option>
            <option value="ORG_ADMIN">ORG_ADMIN</option>
            <option value="PROVINCIAL_ADMIN">PROVINCIAL_ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Temporary password
          <input className="field" type="password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button className="btn" type="submit">
            Create user
          </button>
          <button className="btn btn-outline" type="button" onClick={inviteUser}>
            Send invite
          </button>
        </div>
      </form>
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className="chip">{u.role}</span>
                </td>
                <td>{u.active ? "Yes" : "No"}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button type="button" className="text-sm font-semibold text-g700" onClick={() => patchUser(u.id, { revokeSessions: true })}>
                    Revoke sessions
                  </button>
                  <button type="button" className="text-sm font-semibold text-g700" onClick={() => patchUser(u.id, { active: !u.active })}>
                    {u.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
