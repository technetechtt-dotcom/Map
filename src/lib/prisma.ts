import dns from "dns";
import { PrismaClient } from "@prisma/client";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* Node < 17 */
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function isPostgresUrl(url: string) {
  return /^postgres(?:ql)?:\/\//i.test(url);
}

export function withPoolParams(url: string): string {
  if (!isPostgresUrl(url)) return url;
  const http = url.replace(/^postgres(ql)?:/i, "http:");
  let parsed: URL;
  try {
    parsed = new URL(http);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  const neonPooler = host.includes("-pooler.") || host.includes(".pooler.");
  if (neonPooler && !parsed.searchParams.has("pgbouncer")) {
    parsed.searchParams.set("pgbouncer", "true");
  }
  if (!parsed.searchParams.has("connection_limit")) {
    const fallback = (neonPooler || process.env.NODE_ENV === "development") ? "5" : "10";
    parsed.searchParams.set("connection_limit", process.env.DB_POOL_SIZE || fallback);
  }
  if (!parsed.searchParams.has("pool_timeout")) {
    parsed.searchParams.set("pool_timeout", process.env.DB_POOL_TIMEOUT || "30");
  }
  if (!parsed.searchParams.has("connect_timeout")) {
    parsed.searchParams.set("connect_timeout", process.env.DB_CONNECT_TIMEOUT || "15");
  }
  const proto = /^postgresql:/i.test(url) ? "postgresql:" : "postgres:";
  return parsed.toString().replace(/^http:/i, proto);
}

function createClient() {
  const url = withPoolParams(process.env.DATABASE_URL || "");
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
