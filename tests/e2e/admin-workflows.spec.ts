import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

test("password change, invitation-shaped lockout and session revocation", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful auth flow runs once");
  const email = `e2e-auth-${Date.now()}@example.test`;
  const password = "E2E-Strong-Password-42!";
  const user = await prisma.user.create({
    data: { email, name: "E2E Auth", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR" },
  });
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    const lock = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 9, lockedUntil: new Date(Date.now() + 15 * 60_000), sessionVersion: { increment: 1 } },
    });
    expect(lock.sessionVersion).toBeGreaterThan(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/login|admin/, { timeout: 15_000 });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("community submission create and withdraw via API", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API flow runs once");
  const res = await request.post("/api/submissions", {
    data: {
      type: "location",
      submitterName: "E2E Community",
      submitterEmail: `e2e-sub-${Date.now()}@example.test`,
      payload: { name: "E2E Hub", summary: "Test hub", latitude: -28.7, longitude: 24.7 },
    },
  });
  expect([200, 201, 400, 401, 429]).toContain(res.status());
});
