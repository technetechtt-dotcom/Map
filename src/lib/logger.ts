/**
 * Structured application logging. In production, ship logs to your collector (stdout JSON).
 */

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  // Optional lightweight Sentry capture (no SDK dependency). Prefer @sentry/node in large deploys.
  if (level === "error" && process.env.SENTRY_DSN) {
    void captureSentryMessage(message, meta);
  }
}

async function captureSentryMessage(message: string, meta?: Record<string, unknown>) {
  try {
    const dsn = process.env.SENTRY_DSN!;
    // DSN: https://<key>@oxxxx.ingest.sentry.io/<project>
    const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!m) return;
    const [, key, host, project] = m;
    const url = `https://${host}/api/${project}/store/?sentry_key=${key}&sentry_version=7`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        level: "error",
        platform: "node",
        tags: { service: "sa-ict-map" },
        extra: meta || {},
        timestamp: Date.now() / 1000,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  } catch {
    // never throw from logger
  }
}

export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") emit("debug", message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
