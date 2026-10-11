import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { readJsonLimited } from "@/lib/security";

const itemSchema = z.object({
  kind: z.string().min(2).max(40),
  slug: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
});

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const items = await prisma.savedItem.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ items });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = z.object({ items: z.array(itemSchema).max(100) }).safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400);
  await prisma.$transaction([
    prisma.savedItem.deleteMany({ where: { userId: auth.user.id } }),
    ...body.data.items.map((item) =>
      prisma.savedItem.create({ data: { userId: auth.user.id, ...item } })
    ),
  ]);
  return jsonOk({ synced: body.data.items.length });
}
