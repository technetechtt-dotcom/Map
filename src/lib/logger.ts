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

  // Optional external error reporting (Sentry DSN stub)
  if (level === "error" && process.env.SENTRY_DSN) {
    // Integration point: post to Sentry ingest or @sentry/node when added
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
