import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { isSuperAdmin, requiresMfa } from "@/lib/policy";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { securityAlert } from "@/lib/alerts";
import { invalidateSessionCache } from "@/lib/auth";

const createSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(12).max(2000),
});

const approveSchema = z.object({
  id: z.string().min(1),
  approve: z.boolean(),
  reason: z.string().min(8).max(2000),
});

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const requests = await prisma.mfaRecoveryRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  return jsonOk({ requests });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = createSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const user = await prisma.user.findUnique({ where: { id: body.data.userId } });
  if (!user) return jsonError("User not found", 404);
  if (!requiresMfa(user) && user.role !== "SUPER_ADMIN") return jsonError("Privileged MFA recovery is only for elevated roles", 400);
  if (user.id === auth.user.id) return jsonError("A second Super Admin must open recovery for your account", 403);
  const request = await prisma.mfaRecoveryRequest.create({
    data: {
      userId: user.id,
      requestedById: auth.user.id,
      reason: body.data.reason,
      status: user.role === "SUPER_ADMIN" ? "AWAITING_SECOND_APPROVAL" : "PENDING",
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  await writeAudit({ user: auth.user, action: "MFA_RECOVERY_REQUEST", entityType: "MfaRecoveryRequest", entityId: request.id, metadata: { target: user.id, reason: body.data.reason }, ipAddress: clientIp(req) });
  await securityAlert({
    type: "mfa.reset_requested",
    subject: "Privileged MFA recovery requested",
    body: `MFA recovery was opened for ${user.email}. Reason: ${body.data.reason}`,
    userId: user.id,
    email: user.email,
    metadata: { requestId: request.id, by: auth.user.id },
  });
  return jsonOk({ request }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = approveSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const request = await prisma.mfaRecoveryRequest.findUnique({ where: { id: body.data.id }, include: { user: true } });
  if (!request || request.expiresAt < new Date()) return jsonError("Request expired or missing", 404);
  if (request.requestedById === auth.user.id && request.user.role === "SUPER_ADMIN") {
    return jsonError("Two-person approval required: a different Super Admin must approve", 403);
  }
  if (!body.data.approve) {
    await prisma.mfaRecoveryRequest.update({ where: { id: request.id }, data: { status: "REJECTED", approvedById: auth.user.id, reason: `${request.reason}\nRejected: ${body.data.reason}` } });
    return jsonOk({ rejected: true });
  }
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.mfaRecoveryRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", approvedById: auth.user.id, tokenHash, expiresAt: new Date(Date.now() + 15 * 60_000) },
    }),
    prisma.user.update({
      where: { id: request.userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaPendingSecret: null,
        mfaRecoveryHashes: [],
        sessionVersion: { increment: 1 },
        mustChangePassword: true,
      },
    }),
  ]);
  await invalidateSessionCache(request.userId);
  await writeAudit({ user: auth.user, action: "MFA_RECOVERY_APPROVED", entityType: "User", entityId: request.userId, metadata: { reason: body.data.reason }, ipAddress: clientIp(req) });
  await securityAlert({
    type: "mfa.reset",
    subject: "Privileged MFA was reset",
    body: "A Super Admin reset MFA on your account. All sessions were revoked. Sign in with your password and enrol MFA immediately.",
    userId: request.userId,
    email: request.user.email,
    metadata: { requestId: request.id, by: auth.user.id },
  });
  return jsonOk({ approved: true, recoveryToken: token, note: "Token expires in 15 minutes and is shown once." });
}
