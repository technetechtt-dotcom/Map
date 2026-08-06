"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  province?: { name: string; code: string } | null;
  organisation?: { name: string } | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function createUser() {
    const email = prompt("Email");
    const name = prompt("Name");
    const role = prompt(
      "Role: SUPER_ADMIN | PROVINCIAL_ADMIN | ORG_ADMIN | CONTRIBUTOR",
      "PROVINCIAL_ADMIN"
    );
    const password = prompt("Temp password (min 12 characters)");
    if (!email || !name || !role || !password) return;
    if (password.length < 12) {
      setMsg("Password must be at least 12 characters");
      return;
    }
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role, password }),
    });
    setMsg(r.ok ? "User created (must change password on first login)" : "Failed");
    load();
  }

  async function inviteUser() {
    const email = prompt("Invite email");
    const role = prompt("Role", "PROVINCIAL_ADMIN");
    if (!email || !role) return;
    const r = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.acceptPath) {
      setMsg(`Invite created. Path: ${data.acceptPath} token: ${data.acceptToken}`);
    } else {
      setMsg(data.error || "Invite failed");
    }
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
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Phase 4 roles</p>
          <h1 className="text-2xl font-extrabold">Users & provincial admins</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={createUser}>
            Add user
          </button>
          <button className="btn" type="button" onClick={inviteUser}>
            Invite
          </button>
        </div>
      </div>
      {msg && <p className="mb-3 text-sm font-semibold text-g700 break-all">{msg}</p>}
      <div className="panel-card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Province</th>
              <th>Organisation</th>
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
                <td>{u.province?.name || "—"}</td>
                <td>{u.organisation?.name || "—"}</td>
                <td>{u.active ? "Yes" : "No"}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    className="text-sm font-semibold text-g700"
                    onClick={() => patchUser(u.id, { revokeSessions: true })}
                  >
                    Revoke sessions
                  </button>
                  <button
                    type="button"
                    className="text-sm font-semibold text-g700"
                    onClick={() => patchUser(u.id, { active: !u.active })}
                  >
                    {u.active ? "Disable" : "Enable"}
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
