import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { readJsonLimited } from "@/lib/security";
import { rateLimitAsync } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security";

export const runtime = "nodejs";

/** Receive browser CSP violation reports without reflecting their content. */
export async function POST(req: NextRequest) {
  const limited = await rateLimitAsync(`csp-report:${clientIdentity(req)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limited.ok) return new NextResponse(null, { status: 204 });

  const parsed = await readJsonLimited(req, 32 * 1024);
  if (parsed.ok) {
    const envelope = parsed.data as Record<string, unknown>;
    const report = (envelope["csp-report"] || envelope.body || envelope) as Record<
      string,
      unknown
    >;
    log.warn("security.csp_violation", {
      blockedUri: String(report["blocked-uri"] || report.blockedURL || "").slice(0, 500),
      directive: String(report["violated-directive"] || report.effectiveDirective || "").slice(
        0,
        120
      ),
      documentUri: String(report["document-uri"] || report.documentURL || "").slice(0, 500),
    });
  }
  return new NextResponse(null, { status: 204 });
}
