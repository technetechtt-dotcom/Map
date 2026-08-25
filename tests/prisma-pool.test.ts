import { describe, expect, it } from "vitest";
import { withPoolParams } from "@/lib/prisma";

describe("Prisma pool URL", () => {
  it("marks Neon pooler URLs for PgBouncer and keeps a small client pool", () => {
    const url = withPoolParams(
      "postgresql://u:p@ep-mute-sun-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require"
    );
    expect(url).toContain("pgbouncer=true");
    expect(url).toContain("connection_limit=5");
    expect(url).toContain("pool_timeout=30");
    expect(url).toContain("connect_timeout=15");
  });

  it("does not invent pgbouncer on a direct host", () => {
    const url = withPoolParams("postgresql://u:p@localhost:5432/ictmap");
    expect(url).not.toContain("pgbouncer=");
  });
});
