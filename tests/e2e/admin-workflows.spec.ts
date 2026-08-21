import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

test("password change revokes the current session", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful auth flow runs once");
  const email = `e2e-auth-${Date.now()}@example.test`;
  const password = "E2E-Strong-Password-42!";
  const nextPassword = "E2E-Strong-Password-99!";
  const user = await prisma.user.create({
    data: { email, name: "E2E Auth", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR" },
  });
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    const changed = await page.request.post("/api/auth/change-password", {
      data: { currentPassword: password, newPassword: nextPassword },
    });
    expect(changed.ok()).toBeTruthy();
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/, { timeout: 15_000 });

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(nextPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  } finally {
    await prisma.passwordHistory.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("community submission creates a submitted record", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API flow runs once");
  const email = `e2e-sub-${Date.now()}@example.test`;
  const res = await request.post("/api/submissions", {
    data: {
      type: "location",
      submitterName: "E2E Community",
      submitterEmail: email,
      payload: { name: "E2E Hub", summary: "Test hub for Northern Cape ICT mapping", latitude: -28.7, longitude: 24.7, provinceSlug: "northern-cape" },
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.status).toBe("SUBMITTED");
  expect(body.id).toBeTruthy();
  await prisma.submission.delete({ where: { id: body.id } }).catch(() => undefined);
});
