/**
 * Verify Neon/PostGIS (or any PostgreSQL) production-like setup.
 * Uses DATABASE_URL (runtime/pooler) and DIRECT_URL (migrations).
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const runtime = process.env.DATABASE_URL;
  const direct = process.env.DIRECT_URL || runtime;
  if (!runtime) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: runtime } } });
  const extensions = await prisma.$queryRaw`
    SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis','pg_trgm')
  `;
  const hasPostgis = extensions.some((row) => row.extname === "postgis");
  const hasTrgm = extensions.some((row) => row.extname === "pg_trgm");
  if (!hasPostgis || !hasTrgm) {
    throw new Error(`Missing extensions postgis=${hasPostgis} pg_trgm=${hasTrgm}`);
  }
  const tables = await prisma.$queryRaw`SELECT to_regclass('"Location"')::text AS location`;
  if (!tables[0]?.location) throw new Error("Location table missing");
  const checks = {
    extensions,
    pooling: {
      runtimeHasPgBouncer: /pgbouncer=true|pooler/i.test(runtime),
      directIsUnpooled: Boolean(direct) && (!/pooler/i.test(direct) || direct !== runtime),
      connectionLimit: process.env.DB_POOL_SIZE || "10",
    },
    schema: tables,
  };
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
