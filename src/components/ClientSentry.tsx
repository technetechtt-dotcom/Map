"use client";

import { useEffect } from "react";

export default function ClientSentry() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    const onError = (event: ErrorEvent) => {
      void fetch("/api/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "client.error", message: event.message, release: process.env.NEXT_PUBLIC_SENTRY_RELEASE }),
      }).catch(() => undefined);
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);
  return null;
}
