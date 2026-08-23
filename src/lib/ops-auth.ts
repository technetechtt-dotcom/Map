/**
 * Fail-closed auth for operational endpoints (metrics, cron, maintenance jobs).
 */
import type { AuthUser } from "./policy";
import { canManageBackups, isProvincialAdmin, isSuperAdmin } from "./policy";

export const GLOBAL_MAINTENANCE_JOBS = new Set(["prune", "backup", "cleanup", "all", "pending-mfa", "notify", "requeue", "ingest"]);
export const TENANT_SCOPED_JOBS = new Set([
  "expiry",
  "duplicates",
  "geocode",
  "analytics",
  "report",
  "import",
  "queue",
]);

export type TokenAuthResult = { ok: true } | { ok: false; status: number; error: string };

export function authorizeBearerOrHeader(opts: {
  provided: string;
  secret: string;
  production: boolean;
  missingSecretStatus?: number;
  missingSecretError?: string;
}): TokenAuthResult {
  if (opts.production && !opts.secret) {
    return {
      ok: false,
      status: opts.missingSecretStatus ?? 503,
      error: opts.missingSecretError ?? "Not configured",
    };
  }
  if (opts.secret && opts.provided !== opts.secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (opts.production && opts.provided !== opts.secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export function authorizeMetricsRequest(req: { headers: { get(name: string): string | null } }): TokenAuthResult {
  const secret = process.env.METRICS_TOKEN || process.env.CRON_SECRET || "";
  const provided =
    req.headers.get("x-metrics-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return authorizeBearerOrHeader({
    provided,
    secret,
    production: process.env.NODE_ENV === "production",
    missingSecretError: "Metrics not configured",
  });
}

export function authorizeCronSecret(req: { headers: { get(name: string): string | null } }): TokenAuthResult & { via?: "cron" } {
  const secret = process.env.CRON_SECRET || "";
  const provided =
    req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (secret && provided === secret) return { ok: true, via: "cron" };
  if (process.env.NODE_ENV === "production" && !secret) {
    return { ok: false, status: 503, error: "Cron secret not configured" };
  }
  return { ok: false, status: 401, error: "Unauthorized" };
}

export function authorizeJobRole(user: AuthUser | null | undefined, job: string): { ok: true; provinceId?: string } | { ok: false; reason: string } {
  if (!user?.id) return { ok: false, reason: "Unauthorized" };
  if (isSuperAdmin(user) || canManageBackups(user)) return { ok: true };
  if (isProvincialAdmin(user)) {
    if (!user.provinceId) return { ok: false, reason: "Provincial admin has no province assignment" };
    if (GLOBAL_MAINTENANCE_JOBS.has(job)) return { ok: false, reason: "Forbidden — super admin only" };
    if (job && !TENANT_SCOPED_JOBS.has(job)) return { ok: false, reason: "Forbidden — super admin only" };
    return { ok: true, provinceId: user.provinceId };
  }
  return { ok: false, reason: "Forbidden" };
}
