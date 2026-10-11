import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, enforceRateLimitAsync } from "@/lib/api";
import { parseTrackingRef } from "@/lib/tracking";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "track", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const ref = parseTrackingRef(req.nextUrl.searchParams.get("ref") || "");
  if (!ref) return jsonError("Valid tracking reference required", 400);
  const row = await prisma.submission.findFirst({
    where: { trackingRef: ref },
    select: { trackingRef: true, status: true, type: true, reviewedNotes: true, updatedAt: true },
  });
  if (!row) return jsonError("Submission not found", 404);
  return jsonOk({
    trackingRef: row.trackingRef,
    status: row.status,
    type: row.type,
    reviewerComment: row.status === "NEEDS_INFORMATION" ? row.reviewedNotes : undefined,
    updatedAt: row.updatedAt,
  });
}
