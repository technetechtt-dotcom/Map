/** Fail fast on a production server when critical security configuration is missing. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const required = [
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "DATABASE_URL",
    "BACKUP_ENCRYPTION_KEY",
    "MFA_ENCRYPTION_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (!/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || "")) missing.push("DATABASE_URL(postgresql)");
  if (!/^https:\/\//i.test(process.env.NEXTAUTH_URL || "")) missing.push("NEXTAUTH_URL(https)");
  if (process.env.CAPTCHA_DISABLED === "1") missing.push("CAPTCHA_DISABLED(disallowed)");
  if (process.env.STORAGE_DRIVER !== "s3") missing.push("STORAGE_DRIVER=s3");
  for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    if (!process.env[key]) missing.push(key);
  }
  if (process.env.TRUST_PROXY === "1" && !process.env.TRUST_PROXY_CIDRS && !process.env.TRUST_PROXY_HEADER_SECRET) {
    missing.push("TRUST_PROXY_CIDRS/TRUST_PROXY_HEADER_SECRET");
  }
  if (missing.length) throw new Error(`Production environment is incomplete: ${missing.join(", ")}`);
}
