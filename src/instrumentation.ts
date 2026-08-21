/** Fail fast on a production server when critical security configuration is missing. */
import { productionBootGaps } from "./lib/env";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const missing = productionBootGaps(process.env);
  if (missing.length) throw new Error(`Production environment is incomplete: ${missing.join(", ")}`);
}
