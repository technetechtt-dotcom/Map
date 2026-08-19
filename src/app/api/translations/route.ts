import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { canVerify } from "@/lib/policy";
import { readJsonLimited } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get("entityType") || "";
  const entityId = req.nextUrl.searchParams.get("entityId") || "";
  const locale = req.nextUrl.searchParams.get("locale") || "en";
  if (!entityType || !entityId) return jsonError("entityType and entityId required");
  const rows = await prisma.translation.findMany({ where: { entityType, entityId, locale } });
  return jsonOk({ locale, fields: Object.fromEntries(rows.map((row) => [row.field, row.value])) });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!canVerify(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = z.object({ entityType: z.string().min(1).max(50), entityId: z.string().min(1), locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/), fields: z.record(z.string(), z.string().max(20_000)) }).safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  await prisma.$transaction(Object.entries(body.data.fields).map(([field, value]) => prisma.translation.upsert({
    where: { entityType_entityId_field_locale: { entityType: body.data.entityType, entityId: body.data.entityId, field, locale: body.data.locale } },
    update: { value },
    create: { entityType: body.data.entityType, entityId: body.data.entityId, field, locale: body.data.locale, value },
  })));
  await writeAudit({ user: auth.user, action: "TRANSLATION_UPDATE", entityType: body.data.entityType, entityId: body.data.entityId, metadata: { locale: body.data.locale, fields: Object.keys(body.data.fields) } });
  return jsonOk({ updated: Object.keys(body.data.fields).length });
}
