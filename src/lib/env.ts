/**
 * Validate critical environment variables. Production refuses to start without secrets.
 */

import { log } from "./logger";

export type EnvIssue = { key: string; level: "error" | "warn"; message: string };

const PLACEHOLDERS = [
  "changeme",
  "generate-a-long-random-string",
  "your-long-secret",
  "ci-test-secret-not-for-production-use",
  "password",
  "secret",
];

function isPlaceholder(v: string) {
  const s = v.trim().toLowerCase();
  return PLACEHOLDERS.some((p) => s === p || s.includes("changeme") || s.includes("replace-me"));
}

export function validateEnv(options?: { productionOnly?: boolean }): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const prod = process.env.NODE_ENV === "production";
  if (options?.productionOnly && !prod) return issues;

  const require = (key: string, minLen = 8) => {
    const v = process.env[key];
    if (!v || v.length < minLen) {
      issues.push({
        key,
        level: "error",
        message: `${key} must be set${minLen > 1 ? ` (min ${minLen} chars)` : ""}`,
      });
      return;
    }
    if (prod && isPlaceholder(v)) {
      issues.push({ key, level: "error", message: `${key} looks like a placeholder — rotate before launch` });
    }
  };

  const enforce = prod || process.env.ENFORCE_ENV_VALIDATION === "1";
  if (!enforce) return issues;

  require("NEXTAUTH_SECRET", 32);
  require("NEXTAUTH_URL", 8);
  require("DATABASE_URL", 10);
  require("BACKUP_ENCRYPTION_KEY", 16);
  require("MFA_ENCRYPTION_KEY", 16);

  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    issues.push({
      key: "DATABASE_URL",
      level: "error",
      message: "Production database must be PostgreSQL (postgres:// or postgresql://)",
    });
  }

  if (process.env.CAPTCHA_DISABLED !== "1") {
    if (!process.env.TURNSTILE_SECRET && !process.env.RECAPTCHA_SECRET) {
      issues.push({
        key: "CAPTCHA",
        level: "error",
        message: "Set TURNSTILE_SECRET or RECAPTCHA_SECRET (CAPTCHA_DISABLED=1 is not allowed in public production)",
      });
    }
  } else if (prod) {
    issues.push({
      key: "CAPTCHA_DISABLED",
      level: "error",
      message: "CAPTCHA_DISABLED is not allowed in production",
    });
  }

  if (prod && process.env.STORAGE_DRIVER !== "s3") {
    issues.push({
      key: "STORAGE_DRIVER",
      level: "error",
      message: "Production must use STORAGE_DRIVER=s3",
    });
  }
  if (process.env.STORAGE_DRIVER === "s3") {
    require("S3_BUCKET", 3);
    require("S3_ACCESS_KEY_ID", 8);
    require("S3_SECRET_ACCESS_KEY", 8);
    if (process.env.STORAGE_ALLOW_LOCAL_FALLBACK === "1") {
      issues.push({
        key: "STORAGE_ALLOW_LOCAL_FALLBACK",
        level: "error",
        message: "Local fallback is forbidden in production",
      });
    }
  }

  if (prod && !process.env.UPSTASH_REDIS_REST_URL && !process.env.REDIS_URL) {
    issues.push({
      key: "UPSTASH_REDIS_REST_URL",
      level: "error",
      message: "Production requires Redis/Upstash for distributed rate limiting",
    });
  }

  if (prod && process.env.TRUST_PROXY !== "0" && process.env.TRUST_PROXY !== "1") {
    issues.push({
      key: "TRUST_PROXY",
      level: "error",
      message: "Set TRUST_PROXY=1 behind a reverse proxy, or TRUST_PROXY=0 if exposed directly",
    });
  }

  if (prod && !process.env.SENTRY_DSN && !process.env.MONITORING_OPTIONAL) {
    issues.push({
      key: "SENTRY_DSN",
      level: "warn",
      message: "Set SENTRY_DSN (or MONITORING_OPTIONAL=1) for error tracking",
    });
  }

  return issues;
}

export function assertEnvOrLog(): EnvIssue[] {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const issues = validateEnv();
  for (const i of issues) {
    if (i.level === "error") log.error("env.invalid", { key: i.key, message: i.message });
    else log.warn("env.warning", { key: i.key, message: i.message });
  }
  const errors = issues.filter((i) => i.level === "error");
  const mustThrow =
    errors.length > 0 &&
    process.env.NODE_ENV === "production" &&
    process.env.SKIP_ENV_VALIDATION !== "1";
  if (mustThrow) {
    throw new Error(`Missing required environment: ${errors.map((e) => e.key).join(", ")}`);
  }
  return issues;
}
