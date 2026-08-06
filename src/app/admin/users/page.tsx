"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<{
    id: string; email: string; name: string; role: string; active: boolean;
    province?: { name: string; code: string } | null;
    organisation?: { name: string } | null;
  }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/users");
    if (!r.ok) {
      setMsg("Super admin only");
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
    const role = prompt("Role: SUPER_ADMIN | PROVINCIAL_ADMIN | ORG_ADMIN | CONTRIBUTOR", "PROVINCIAL_ADMIN");
    const password = prompt("Temp password", "ChangeMe123!");
    if (!email || !name || !role || !password) return;
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role, password }),
    });
    setMsg(r.ok ? "User created" : "Failed");
    load();
  }

  return (
    <AdminShell>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Phase 4 roles</p>
          <h1 className="text-2xl font-extrabold">Users & provincial admins</h1>
        </div>
        <button className="btn" type="button" onClick={createUser}>Add user</button>
      </div>
      {msg && <p className="mb-3 text-sm font-semibold text-g700">{msg}</p>}
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
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className="chip">{u.role}</span></td>
                <td>{u.province?.name || "—"}</td>
                <td>{u.organisation?.name || "—"}</td>
                <td>{u.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
