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
  "change-in-production",
  "dev-secret",
  "example.com",
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
  if (!process.env.METRICS_TOKEN && !process.env.CRON_SECRET) {
    issues.push({
      key: "METRICS_TOKEN",
      level: "error",
      message: "Set METRICS_TOKEN or CRON_SECRET — metrics must fail closed in production",
    });
  }
  if (!process.env.CRON_SECRET) {
    issues.push({
      key: "CRON_SECRET",
      level: "error",
      message: "CRON_SECRET is required to authorize maintenance jobs",
    });
  }
  if (process.env.AWS_KMS_KEY_ID) {
    if (!process.env.MFA_KMS_CIPHERTEXT && !process.env.MFA_KMS_CIPHERTEXT_V1) {
      issues.push({
        key: "MFA_KMS_CIPHERTEXT",
        level: "error",
        message: "AWS_KMS_KEY_ID is set but MFA_KMS_CIPHERTEXT is missing",
      });
    }
  }
  const mfaVersion = Number(process.env.MFA_KEY_VERSION || 1);
  if (!Number.isInteger(mfaVersion) || mfaVersion < 1) {
    issues.push({ key: "MFA_KEY_VERSION", level: "error", message: "MFA_KEY_VERSION must be a positive integer" });
  }
  const mfaKeyName = process.env[`MFA_ENCRYPTION_KEY_V${mfaVersion}`]
    ? `MFA_ENCRYPTION_KEY_V${mfaVersion}`
    : "MFA_ENCRYPTION_KEY";
  require(mfaKeyName, 32);

  if (!/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || "")) {
    issues.push({
      key: "DATABASE_URL",
      level: "error",
      message: "Production database must be PostgreSQL (postgres:// or postgresql://)",
    });
  }

  if (prod) {
    const nextAuthUrl = process.env.NEXTAUTH_URL || "";
    if (!/^https:\/\//i.test(nextAuthUrl) || /localhost|127\.0\.0\.1|::1/i.test(nextAuthUrl)) {
      issues.push({
        key: "NEXTAUTH_URL",
        level: "error",
        message: "Production NEXTAUTH_URL must be an HTTPS public origin",
      });
    }
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

  if (prod && !process.env.UPSTASH_REDIS_REST_URL) {
    issues.push({
      key: "UPSTASH_REDIS_REST_URL",
      level: "error",
      message: "Production requires Upstash Redis REST for distributed rate limiting",
    });
  }
  if (prod && process.env.RATE_LIMIT_ALLOW_MEMORY === "1") {
    issues.push({ key: "RATE_LIMIT_ALLOW_MEMORY", level: "error", message: "Per-instance memory rate limiting is forbidden in production" });
  }
  if (prod && process.env.RATE_LIMIT_FAIL_OPEN === "1") {
    issues.push({ key: "RATE_LIMIT_FAIL_OPEN", level: "error", message: "Rate limiting must fail closed in production" });
  }
  if (process.env.UPSTASH_REDIS_REST_URL) require("UPSTASH_REDIS_REST_TOKEN", 16);

  if (prod && process.env.TRUST_PROXY !== "0" && process.env.TRUST_PROXY !== "1") {
    issues.push({
      key: "TRUST_PROXY",
      level: "error",
      message: "Set TRUST_PROXY=1 behind a reverse proxy, or TRUST_PROXY=0 if exposed directly",
    });
  }
  if (prod && process.env.TRUST_PROXY === "1") {
    const hops = Number(process.env.TRUST_PROXY_HOPS || 0);
    if (!Number.isInteger(hops) || hops < 1 || hops > 16) {
      issues.push({ key: "TRUST_PROXY_HOPS", level: "error", message: "Set the exact trusted proxy hop count (1-16)" });
    }
    if (!process.env.TRUST_PROXY_CIDRS && !process.env.TRUST_PROXY_HEADER_SECRET) {
      issues.push({ key: "TRUST_PROXY_CIDRS", level: "error", message: "Allow-list proxy CIDRs or configure a trusted ingress header secret" });
    }
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

/** Hard boot gaps for `next start` in real production. CI/e2e must not use this gate. */
export function productionBootGaps(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.CI && env.CI !== "0" && env.CI !== "false") return [];
  if (env.E2E === "1") return [];
  const required = [
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "DATABASE_URL",
    "BACKUP_ENCRYPTION_KEY",
    "CRON_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const missing = required.filter((key) => !env[key]);
  if (!env.MFA_ENCRYPTION_KEY && !env.MFA_ENCRYPTION_KEY_V1) missing.push("MFA_ENCRYPTION_KEY");
  if (!env.METRICS_TOKEN && !env.CRON_SECRET) missing.push("METRICS_TOKEN");
  if (!/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL || "")) missing.push("DATABASE_URL(postgresql)");
  if (!/^https:\/\//i.test(env.NEXTAUTH_URL || "")) missing.push("NEXTAUTH_URL(https)");
  if (env.CAPTCHA_DISABLED === "1") missing.push("CAPTCHA_DISABLED(disallowed)");
  if (env.STORAGE_DRIVER !== "s3") missing.push("STORAGE_DRIVER=s3");
  for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    if (!env[key]) missing.push(key);
  }
  if (env.TRUST_PROXY === "1" && !env.TRUST_PROXY_CIDRS && !env.TRUST_PROXY_HEADER_SECRET) {
    missing.push("TRUST_PROXY_CIDRS/TRUST_PROXY_HEADER_SECRET");
  }
  return missing;
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
    process.env.CI !== "1" &&
    process.env.CI !== "true" &&
    process.env.E2E !== "1";
  if (mustThrow) {
    throw new Error(`Missing required environment: ${errors.map((e) => e.key).join(", ")}`);
  }
  return issues;
}
