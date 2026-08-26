/**
 * Next compiles this file for Edge as well as Node. Do not import @sentry/node
 * here — webpack follows the import and then cannot resolve Node builtins.
 * Server errors are captured in src/lib/logger.ts when SENTRY_DSN is set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
}
