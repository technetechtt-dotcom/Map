import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/shape";

export async function getEcosystemItems(
  type: "funding" | "events" | "programmes" | "procurement",
  provinceSlug?: string
) {
  const provinceFilter = provinceSlug
    ? {
        province: {
          OR: [
            { slug: provinceSlug },
            { code: provinceSlug },
            { name: provinceSlug },
          ],
        },
      }
    : {};

  if (type === "events") {
    const rows = await prisma.ecosystemEvent.findMany({
      where: { status: "PUBLISHED", ...provinceFilter },
      include: { province: true, organisation: true },
      orderBy: { startsAt: "asc" },
    });
    return rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) }));
  }

  if (type === "programmes") {
    const rows = await prisma.programme.findMany({
      where: { status: "PUBLISHED", ...provinceFilter },
      include: { province: true, organisation: true },
      orderBy: { title: "asc" },
    });
    return rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) }));
  }

  if (type === "procurement") {
    const rows = await prisma.procurement.findMany({
      where: { status: "PUBLISHED", ...provinceFilter },
      include: { province: true, organisation: true },
      orderBy: { closingDate: "asc" },
    });
    return rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) }));
  }

  const rows = await prisma.fundingCall.findMany({
    where: { status: "PUBLISHED", ...provinceFilter },
    include: { province: true, organisation: true },
    orderBy: { deadline: "asc" },
  });
  return rows.map((r) => ({ ...r, tags: parseJsonArray(r.tagsJson) }));
}
