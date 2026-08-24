export type VerificationTier = "unverified" | "directory" | "desktop" | "field";

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

export function isVerificationCurrent(expiresAt?: Date | string | null, now = new Date()) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > now.getTime();
}

/** Map/API filter. `verified=1` remains an alias for current (not expired) desktop+field. */
export function verificationFilterWhere(filter: string | null | undefined, now = new Date()) {
  const value = (filter || "").trim().toLowerCase();
  const currentExpiry = {
    OR: [{ verificationExpiresAt: null }, { verificationExpiresAt: { gt: now } }],
  };
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
