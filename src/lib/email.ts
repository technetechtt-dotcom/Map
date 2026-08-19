export function renderEmail(type: string, body: string, subject: string) {
  const unsubscribe = `${process.env.NEXTAUTH_URL || ""}/account/security`;
  return {
    subject,
    text: body,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#102a43">
      <p>${body.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>
      <hr/>
      <p style="font-size:12px;color:#627d98">SA ICT Ecosystem Map · ${type}</p>
      <p style="font-size:12px"><a href="${unsubscribe}">Notification preferences / unsubscribe</a></p>
    </body></html>`,
  };
}

export async function sendViaResend(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM_EMAIL || "noreply@example.com",
      to,
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}`);
  const json = (await response.json()) as { id?: string };
  return { provider: "resend", receiptId: json.id || null };
}
