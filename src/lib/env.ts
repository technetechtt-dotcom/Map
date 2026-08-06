/**
 * Validate critical environment variables at runtime (API routes / seed).
 * Does not throw during Next build when NEXT_PHASE=phase-production-build.
 */

import { log } from "./logger";

export type EnvIssue = { key: string; level: "error" | "warn"; message: string };

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
    }
  };

  if (prod || process.env.ENFORCE_ENV_VALIDATION === "1") {
    require("NEXTAUTH_SECRET", 16);
    require("DATABASE_URL", 4);
    require("BACKUP_ENCRYPTION_KEY", 16);
    if (process.env.CAPTCHA_DISABLED !== "1") {
      if (!process.env.TURNSTILE_SECRET && !process.env.RECAPTCHA_SECRET) {
        issues.push({
          key: "CAPTCHA",
          level: "error",
          message: "Set TURNSTILE_SECRET or RECAPTCHA_SECRET (or CAPTCHA_DISABLED=1 only for non-public)",
        });
      }
    }
    if (process.env.STORAGE_DRIVER === "s3" && process.env.STORAGE_ALLOW_LOCAL_FALLBACK === "1") {
      issues.push({
        key: "STORAGE_ALLOW_LOCAL_FALLBACK",
        level: "warn",
        message: "Local fallback with S3 driver hides storage failures in production",
      });
    }
    if (!process.env.TRUST_PROXY && prod) {
      issues.push({
        key: "TRUST_PROXY",
        level: "warn",
        message: "Set TRUST_PROXY=1 only when behind a trusted reverse proxy",
      });
    }
  }

  return issues;
}

export function assertEnvOrLog(): EnvIssue[] {
  // Skip hard-fail during next build compilation of pages
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const issues = validateEnv();
  for (const i of issues) {
    if (i.level === "error") log.error("env.invalid", { key: i.key, message: i.message });
    else log.warn("env.warning", { key: i.key, message: i.message });
  }
  const errors = issues.filter((i) => i.level === "error");
  if (
    errors.length &&
    process.env.NODE_ENV === "production" &&
    process.env.ENFORCE_ENV_VALIDATION === "1"
  ) {
    throw new Error(`Missing required environment: ${errors.map((e) => e.key).join(", ")}`);
  }
  return issues;
}
