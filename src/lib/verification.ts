export type VerificationTier = "unverified" | "directory" | "desktop" | "field";

const PROTECTED_TIERS: VerificationTier[] = ["desktop", "field"];

export function verificationTtlDays(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const raw = Number(env.VERIFICATION_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 365;
}

export function defaultVerificationExpiresAt(from = new Date(), ttlDays = verificationTtlDays()) {
  return new Date(from.getTime() + ttlDays * 24 * 3600_000);
}

export function deriveVerificationTier(input: {
  lastVerifiedAt?: Date | string | null;
  coordQuality?: string | null;
  sourceConfidence?: string | null;
  verificationTier?: string | null;
}): VerificationTier {
  if (input.verificationTier === "field" || input.verificationTier === "desktop" || input.verificationTier === "directory" || input.verificationTier === "unverified") {
    return input.verificationTier;
  }
  if (input.coordQuality === "verified" && input.lastVerifiedAt) return "field";
  if (input.lastVerifiedAt) return "desktop";
  if (input.sourceConfidence === "public-directory" || input.sourceConfidence === "directory" || input.coordQuality === "directory-only") {
    return "directory";
  }
  return "unverified";
}

export function isProtectedVerificationTier(tier?: string | null) {
  return PROTECTED_TIERS.includes((tier || "") as VerificationTier);
}

export function isVerificationCurrent(expiresAt?: Date | string | null, now = new Date()) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > now.getTime();
}

export function verificationStamp(input?: {
  tier?: VerificationTier;
  now?: Date;
  source?: string | null;
  existingTier?: string | null;
}) {
  const now = input?.now || new Date();
  const requested = input?.tier;
  const existing = input?.existingTier;
  const tier: VerificationTier =
    requested === "field" || requested === "desktop" || requested === "directory" || requested === "unverified"
      ? requested
      : existing === "field"
        ? "field"
        : "desktop";
  return {
    lastVerifiedAt: now,
    verificationExpiresAt: defaultVerificationExpiresAt(now),
    verificationTier: tier,
    ...(input?.source ? { verificationSource: input.source } : {}),
  };
}

export function organisationVerificationStamp(input?: Parameters<typeof verificationStamp>[0]) {
  const stamp = verificationStamp(input);
  const verified = stamp.verificationTier === "desktop" || stamp.verificationTier === "field";
  return {
    ...stamp,
    verified,
    verifiedAt: stamp.lastVerifiedAt,
  };
}

export function verificationActionData(input: {
  status?: string | null;
  requestedTier?: string | null;
  existingTier?: string | null;
  source?: string | null;
  now?: Date;
}) {
  if (input.status !== "VERIFIED" && input.status !== "PUBLISHED") return {};
  const requested =
    input.requestedTier === "field" || input.requestedTier === "desktop" ? input.requestedTier : undefined;
  return verificationStamp({
    tier: requested,
    existingTier: input.existingTier,
    source: input.source,
    now: input.now,
  });
}

/** Map/API filter. `verified=1` remains an alias for current (not expired) desktop+field. */
export function verificationFilterWhere(filter: string | null | undefined, now = new Date()) {
  const value = (filter || "").trim().toLowerCase();
  const currentExpiry = { verificationExpiresAt: { gt: now } };
  if (!value || value === "all") return {};
  if (value === "1" || value === "current") {
    return { lastVerifiedAt: { not: null }, verificationTier: { in: ["desktop", "field"] }, ...currentExpiry };
  }
  if (value === "field") return { verificationTier: "field", ...currentExpiry };
  if (value === "desktop") return { verificationTier: "desktop", ...currentExpiry };
  if (value === "directory") return { verificationTier: "directory" };
  if (value === "expired") {
    return { lastVerifiedAt: { not: null }, verificationExpiresAt: { lte: now } };
  }
  if (value === "unverified") return { verificationTier: "unverified" };
  return {};
}
