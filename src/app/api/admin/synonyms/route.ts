import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { isSuperAdmin } from "@/lib/policy";
import { readJsonLimited } from "@/lib/security";

export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get("locale") || undefined;
  const synonyms = await prisma.searchSynonym.findMany({
    where: locale ? { locale } : undefined,
    orderBy: [{ locale: "asc" }, { term: "asc" }],
  });
  return jsonOk({ synonyms });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = z.object({
    term: z.string().min(2).max(80),
    locale: z.string().min(2).max(8).default("en"),
    synonyms: z.array(z.string().min(1).max(80)).min(1).max(30),
  }).safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const row = await prisma.searchSynonym.upsert({
    where: { term_locale: { term: body.data.term.toLowerCase(), locale: body.data.locale } },
    update: { synonymsJson: body.data.synonyms },
    create: { term: body.data.term.toLowerCase(), locale: body.data.locale, synonymsJson: body.data.synonyms },
  });
  return jsonOk({ synonym: row });
}
