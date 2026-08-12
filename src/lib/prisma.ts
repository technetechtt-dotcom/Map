import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function withPoolParams(url: string): string {
  if (!url.startsWith("postgres")) return url;
  const extras: string[] = [];
  if (!url.includes("connection_limit=")) {
    extras.push(`connection_limit=${process.env.DB_POOL_SIZE || "10"}`);
  }
  if (!url.includes("pool_timeout=")) {
    extras.push(`pool_timeout=${process.env.DB_POOL_TIMEOUT || "20"}`);
  }
  if (!url.includes("connect_timeout=")) {
    extras.push(`connect_timeout=${process.env.DB_CONNECT_TIMEOUT || "10"}`);
  }
  if (!extras.length) return url;
  return url + (url.includes("?") ? "&" : "?") + extras.join("&");
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
