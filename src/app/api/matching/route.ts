import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession, enforceRateLimitAsync } from "@/lib/api";
import { scoreFundingMatch, scoreProgrammeMatch, scoreTenderMatch } from "@/lib/matching";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "matching", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const orgId = req.nextUrl.searchParams.get("organisationId") || auth.user.organisationId;
  if (!orgId) return jsonError("organisationId required", 400);
  const organisation = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!organisation) return jsonError("Organisation not found", 404);
  const [funding, tenders, programmes] = await Promise.all([
    prisma.fundingCall.findMany({ where: { status: "PUBLISHED" }, take: 100 }),
    prisma.procurement.findMany({ where: { status: "PUBLISHED" }, take: 100 }),
    prisma.programme.findMany({ where: { status: "PUBLISHED" }, take: 100 }),
  ]);
  return jsonOk({
    funding: funding
      .map((call) => ({ call, ...scoreFundingMatch(organisation, call) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    tenders: tenders
      .map((tender) => ({ tender, ...scoreTenderMatch(organisation, tender) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    programmes: programmes
      .map((programme) => ({ programme, ...scoreProgrammeMatch(organisation, programme) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
  });
}
