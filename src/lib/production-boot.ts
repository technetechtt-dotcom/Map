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
