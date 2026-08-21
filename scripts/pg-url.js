/**
 * Convert a Prisma/Neon DATABASE_URL into a libpq URL for pg_dump/psql.
 * Prisma's `schema=` (and pooler flags) are not valid libpq query parameters.
 */
const DROP = new Set(["schema", "pgbouncer", "connection_limit", "pool_timeout", "socket_timeout"]);

function libpqUrl(connectionUrl) {
  if (!connectionUrl) return "";
  const http = connectionUrl.replace(/^postgres(ql)?:/i, "http:");
  const parsed = new URL(http);
  for (const key of [...parsed.searchParams.keys()]) {
    if (DROP.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  const proto = /^postgresql:/i.test(connectionUrl) ? "postgresql:" : "postgres:";
  return parsed.toString().replace(/^http:/i, proto);
}

module.exports = { libpqUrl };
