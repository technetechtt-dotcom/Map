/** Structured stdout logging plus the supported Sentry Node SDK. */
type Level = "debug" | "info" | "warn" | "error";

let sentryReady: Promise<typeof import("@sentry/node") | null> | null = null;

async function sentry() {
  if (!process.env.SENTRY_DSN) return null;
  sentryReady ??= import("@sentry/node")
    .then((sdk) => {
      sdk.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
        release: process.env.SENTRY_RELEASE || process.env.GIT_SHA,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
        sendDefaultPii: false,
      });
      return sdk;
    })
    .catch(() => null);
  return sentryReady;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  if ((level === "error" || level === "warn") && process.env.SENTRY_DSN) {
    void sentry().then((sdk) => {
      if (!sdk) return;
      sdk.withScope((scope) => {
        if (meta) scope.setExtras(meta);
        scope.setLevel(level === "warn" ? "warning" : level);
        sdk.captureMessage(message);
      });
    });
  }
}

export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") emit("debug", message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
  exception: (error: unknown, meta?: Record<string, unknown>) => {
    emit("error", error instanceof Error ? error.message : String(error), meta);
    void sentry().then((sdk) => sdk?.captureException(error));
  },
};
