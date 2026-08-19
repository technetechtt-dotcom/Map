import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/policy";
import { jsonError, jsonOk, requireSession } from "@/lib/api";
import { readJsonLimited, clientIp } from "@/lib/security";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(3).max(100),
  organisationId: z.string().optional(),
  scopes: z.array(z.enum(["locations:read", "organisations:read", "ecosystem:read"])).min(1),
  rateLimit: z.number().int().min(10).max(10_000).default(600),
  expiresAt: z.string().datetime().optional(),
  allowedCidrs: z.array(z.string().min(3).max(64)).max(20).optional(),
  rotateId: z.string().optional(),
});

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const keys = await prisma.apiKey.findMany({
    select: { id: true, name: true, prefix: true, organisationId: true, scopesJson: true, rateLimit: true, active: true, expiresAt: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ keys });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const body = createSchema.safeParse(parsed.data);
  if (!body.success) return jsonError("Validation failed", 400, { issues: body.error.issues });
  const secret = `ict_live_${randomBytes(32).toString("base64url")}`;
  const prefix = secret.slice(0, 18);
  const key = await prisma.apiKey.create({
    data: {
      name: body.data.name,
      prefix,
      keyHash: hash(secret),
      userId: auth.user.id,
      organisationId: body.data.organisationId,
      scopesJson: body.data.scopes,
      rateLimit: body.data.rateLimit,
      allowedCidrsJson: body.data.allowedCidrs || [],
      rotatedFromId: body.data.rotateId,
      expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : undefined,
    },
  });
  if (body.data.rotateId) {
    await prisma.apiKey.update({ where: { id: body.data.rotateId }, data: { active: false } });
  }
  await writeAudit({ user: auth.user, action: body.data.rotateId ? "API_KEY_ROTATE" : "API_KEY_CREATE", entityType: "ApiKey", entityId: key.id, metadata: { name: key.name, prefix, scopes: body.data.scopes }, ipAddress: clientIp(req) });
  await import("@/lib/alerts").then(({ securityAlert }) =>
    securityAlert({
      type: body.data.rotateId ? "api_key.rotated" : "api_key.created",
      subject: body.data.rotateId ? "API key rotated" : "New API key created",
      body: `API key ${prefix} was ${body.data.rotateId ? "rotated" : "created"}.`,
      userId: auth.user.id,
      email: auth.user.email || undefined,
      metadata: { prefix, organisationId: body.data.organisationId },
    })
  );
  return jsonOk({ key: { id: key.id, name: key.name, prefix }, secret, note: "The secret is shown once." }, 201);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!isSuperAdmin(auth.user)) return jsonError("Forbidden", 403);
  const parsed = await readJsonLimited(req);
  if (!parsed.ok) return jsonError(parsed.error, 413);
  const id = String((parsed.data as { id?: unknown }).id || "");
  if (!id) return jsonError("id required");
  const key = await prisma.apiKey.update({ where: { id }, data: { active: false } });
  await writeAudit({ user: auth.user, action: "API_KEY_REVOKE", entityType: "ApiKey", entityId: id, metadata: { prefix: key.prefix }, ipAddress: clientIp(req) });
  await import("@/lib/alerts").then(({ securityAlert }) =>
    securityAlert({
      type: "api_key.revoked",
      subject: "API key revoked",
      body: `API key ${key.prefix} was revoked.`,
      userId: auth.user.id,
      email: auth.user.email || undefined,
      metadata: { prefix: key.prefix },
    })
  );
  return jsonOk({ revoked: true });
}
