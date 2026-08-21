import type { ApiKey } from "@prisma/client";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { parseJsonArray } from "./shape";
import { clientIpFromHeaders, ipInCidr } from "./security";
import { rateLimitAsync } from "./rate-limit";

export type ApiKeyAuthResult =
  | { ok: true; key: ApiKey }
  | { ok: false; status: 401 | 429; error: string; retryAfterSec?: number };

export async function authenticateApiKey(req: Request, requiredScope: string): Promise<ApiKeyAuthResult> {
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-api-key") || "";
  if (!raw.startsWith("ict_live_")) return { ok: false, status: 401, error: "Invalid API key or scope" };
  const prefix = raw.slice(0, 18);
  const row = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!row || !row.active || (row.expiresAt && row.expiresAt < new Date())) {
    return { ok: false, status: 401, error: "Invalid API key or scope" };
  }
  const expected = Buffer.from(row.keyHash, "hex");
  const actual = Buffer.from(createHash("sha256").update(raw).digest("hex"), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, status: 401, error: "Invalid API key or scope" };
  }
  if (!parseJsonArray(row.scopesJson).includes(requiredScope)) {
    return { ok: false, status: 401, error: "Invalid API key or scope" };
  }
  const allowed = parseJsonArray(row.allowedCidrsJson);
  if (allowed.length) {
    const ip = clientIpFromHeaders(req.headers);
    if (!allowed.some((cidr) => ipInCidr(ip, cidr))) {
      return { ok: false, status: 401, error: "Invalid API key or scope" };
    }
  }
  const quota = await rateLimitAsync(`api-key:${row.id}`, { limit: row.rateLimit, windowMs: 60 * 60_000 });
  if (!quota.ok) {
    return { ok: false, status: 429, error: "API quota exceeded", retryAfterSec: quota.retryAfterSec };
  }
  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { ok: true, key: row };
}
