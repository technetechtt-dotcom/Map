import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

const integration = process.env.POSTGRES_INTEGRATION === "1" ? describe : describe.skip;
const prefix = `vitest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

integration("PostgreSQL application integration", () => {
  afterAll(async () => {
    await prisma.appSetting.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  it("enforces unique constraints", async () => {
    const key = `${prefix}-unique`;
    await prisma.appSetting.create({ data: { key, value: "first" } });
    await expect(prisma.appSetting.create({ data: { key, value: "second" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rolls back failed transactions", async () => {
    const key = `${prefix}-rollback`;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.appSetting.create({ data: { key, value: "temporary" } });
        throw new Error("force rollback");
      })
    ).rejects.toThrow("force rollback");
    expect(await prisma.appSetting.findUnique({ where: { key } })).toBeNull();
  });

  it("serializes concurrent atomic updates without losing writes", async () => {
    const email = `${prefix}@example.test`;
    const user = await prisma.user.create({
      data: { email, name: "Concurrency Test", passwordHash: "not-used", sessionVersion: 0 },
    });
    await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
      )
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(8);
  });

  it("deletes a user without mutating their immutable audit history", async () => {
    const email = `${prefix}-audit@example.test`;
    const user = await prisma.user.create({
      data: { email, name: "Lifecycle Test", passwordHash: "not-used", role: "CONTRIBUTOR" },
    });
    await writeAudit({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      action: "USER_LIFECYCLE_TEST",
      entityType: "User",
      entityId: user.id,
    });
    const before = await prisma.auditLog.findFirstOrThrow({
      where: { action: "USER_LIFECYCLE_TEST", entityId: user.id },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
    expect(after).toMatchObject({
      userId: user.id,
      actorEmail: email,
      actorName: "Lifecycle Test",
      actorRole: "CONTRIBUTOR",
    });
  });

  it("has PostGIS and full-text extensions available", async () => {
    const extensions = await prisma.$queryRaw<{ postgis: boolean; trgm: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS postgis,
             EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS trgm
    `;
    expect(extensions[0]).toEqual({ postgis: true, trgm: true });
  });
});
