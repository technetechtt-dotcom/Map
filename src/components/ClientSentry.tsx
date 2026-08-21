"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/browser";

export default function ClientSentry() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      return;
    }

    const report = (payload: Record<string, unknown>) => {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => {
      report({
        type: "client.error",
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        url: window.location.href,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      report({
        type: "client.unhandledrejection",
        message: event.reason instanceof Error ? event.reason.message : String(event.reason || "unhandledrejection"),
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
        url: window.location.href,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
