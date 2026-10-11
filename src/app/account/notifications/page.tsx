"use client";

import { useEffect, useState } from "react";
import { NOTIFICATION_EVENTS } from "@/lib/notification-events";

type Preference = { eventType: string; email: boolean; inApp: boolean };
type Note = { id: string; type: string; subject: string; body: string; status: string; createdAt: string };

export default function AccountNotificationsPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [notifications, setNotifications] = useState<Note[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/account/notifications");
    const data = await res.json();
    setPreferences(data.preferences || []);
    setNotifications(data.notifications || []);
  }

  useEffect(() => {
    load().catch(() => setMessage("Sign in to manage notifications"));
  }, []);

  async function toggle(eventType: string, field: "email" | "inApp", value: boolean) {
    await fetch("/api/account/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, [field]: value }),
    });
    load();
  }

  return (
    <div className="page">
      <p className="eyebrow">Account</p>
      <h1>Notifications</h1>
      <p className="text-muted mb-4">Funding deadlines, tenders, events, programmes, submissions, claims and corrections.</p>
      {message && <p className="text-sm text-muted">{message}</p>}
      <div className="panel-card overflow-x-auto mb-6">
        <table className="table">
          <thead><tr><th>Event</th><th>Email</th><th>In-app</th></tr></thead>
          <tbody>
            {NOTIFICATION_EVENTS.map((eventType) => {
              const pref = preferences.find((row) => row.eventType === eventType);
              return (
                <tr key={eventType}>
                  <td>{eventType}</td>
                  <td><input type="checkbox" checked={pref?.email ?? true} onChange={(e) => toggle(eventType, "email", e.target.checked)} /></td>
                  <td><input type="checkbox" checked={pref?.inApp ?? true} onChange={(e) => toggle(eventType, "inApp", e.target.checked)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="mb-2 text-lg font-bold">Recent</h2>
      <div className="grid gap-2">
        {notifications.map((note) => (
          <article key={note.id} className="panel-card">
            <p className="text-xs text-muted">{note.type} · {new Date(note.createdAt).toLocaleString()}</p>
            <h3 className="font-semibold">{note.subject}</h3>
            <p className="text-sm text-muted">{note.body}</p>
          </article>
        ))}
        {notifications.length === 0 && <p className="text-muted">No notifications yet.</p>}
      </div>
    </div>
  );
}
