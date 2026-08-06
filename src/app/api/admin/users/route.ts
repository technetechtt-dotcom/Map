import { prisma } from "@/lib/prisma";
import { jsonOk, requireSession, jsonError } from "@/lib/api";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN"]);
  if (auth.error) return auth.error;
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      provinceId: true,
      organisationId: true,
      province: { select: { name: true, code: true } },
      organisation: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(["SUPER_ADMIN"]);
  if (auth.error) return auth.error;
  const body = await req.json();
  if (!body.email || !body.name || !body.password || !body.role) {
    return jsonError("email, name, password, role required");
  }
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash,
      role: body.role,
      provinceId: body.provinceId || null,
      organisationId: body.organisationId || null,
    },
  });
  await writeAudit({
    userId: auth.user.id,
    action: "CREATE_USER",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role, email: user.email },
  });
  return jsonOk({ user: { id: user.id, email: user.email, role: user.role } }, 201);
}
