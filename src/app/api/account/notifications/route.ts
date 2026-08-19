import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const [preferences, notifications] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId: auth.user.id },
      orderBy: { eventType: "asc" },
    }),
    prisma.notification.findMany({
      where: { userId: auth.user.id },
      select: { id: true, type: true, subject: true, body: true, status: true, createdAt: true, sentAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return jsonOk({ preferences, notifications });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = z.object({
    eventType: z.string().min(1).max(80),
    email: z.boolean().optional(),
    inApp: z.boolean().optional(),
  }).safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const preference = await prisma.notificationPreference.upsert({
    where: { userId_eventType: { userId: auth.user.id, eventType: body.data.eventType } },
    update: { ...(body.data.email === undefined ? {} : { email: body.data.email }), ...(body.data.inApp === undefined ? {} : { inApp: body.data.inApp }) },
    create: { userId: auth.user.id, eventType: body.data.eventType, email: body.data.email ?? true, inApp: body.data.inApp ?? true },
  });
  return jsonOk({ preference });
}
