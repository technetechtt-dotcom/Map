import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession } from "@/lib/api";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "PROVINCIAL_ADMIN"]);
  if (auth.error) return auth.error;

  const logs = await prisma.auditLog.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
  return jsonOk({ logs });
}
