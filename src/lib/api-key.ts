import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { parseJsonArray } from "./shape";
import { clientIpFromHeaders, ipInCidr } from "./security";

export async function authenticateApiKey(req: Request, requiredScope: string) {
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-api-key") || "";
  if (!raw.startsWith("ict_live_")) return null;
  const prefix = raw.slice(0, 18);
  const row = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!row || !row.active || (row.expiresAt && row.expiresAt < new Date())) return null;
  const expected = Buffer.from(row.keyHash, "hex");
  const actual = Buffer.from(createHash("sha256").update(raw).digest("hex"), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!parseJsonArray(row.scopesJson).includes(requiredScope)) return null;
  const allowed = parseJsonArray(row.allowedCidrsJson);
  if (allowed.length) {
    const ip = clientIpFromHeaders(req.headers);
    if (!allowed.some((cidr) => ipInCidr(ip, cidr))) return null;
  }
  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return row;
}
