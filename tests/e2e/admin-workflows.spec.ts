import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

test("password change revokes the current session", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful auth flow runs once");
  const email = `e2e-auth-${Date.now()}@example.test`;
  const password = "E2E-Strong-Password-42!";
  const nextPassword = "E2E-Strong-Secret-99!";
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
    expect(changed.status(), await changed.text()).toBe(200);
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

test("community can submit a funding opportunity", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API flow runs once");
  const email = `e2e-fund-${Date.now()}@example.test`;
  const res = await request.post("/api/submissions", {
    data: {
      type: "funding",
      submitterName: "E2E Funder",
      submitterEmail: email,
      payload: { title: "E2E Seed Grant", summary: "Community-submitted funding call for digital skills.", url: "https://example.test/grant", provinceSlug: "northern-cape" },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body.status).toBe("SUBMITTED");
  await prisma.submission.delete({ where: { id: body.id } }).catch(() => undefined);
});

test("admin can create and archive a funding record", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful admin flow runs once");
  test.setTimeout(60_000);
  const email = `e2e-eco-${Date.now()}@example.test`;
  const password = "E2E-Eco-Password-42!";
  const title = `E2E Funding ${Date.now()}`;
  const user = await prisma.user.create({
    data: { email, name: "E2E Eco", passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" },
  });
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({ timeout: 20_000 });
    await page.goto("/admin/ecosystem");
    await expect(page.getByRole("heading", { name: /funding, events, programmes, procurement/i })).toBeVisible();
    await page.locator("form input").first().fill(title);
    await page.locator("form textarea").first().fill("E2E funding call for digital skills.");
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    const archived = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/api/ecosystem/"), { timeout: 20_000 });
    await page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: /^archive$/i }).click();
    const archiveRes = await archived;
    expect(archiveRes.ok(), await archiveRes.text()).toBeTruthy();
    await expect(page.getByRole("row").filter({ hasText: title }).getByText("ARCHIVED")).toBeVisible({ timeout: 15_000 });
  } finally {
    await prisma.fundingCall.deleteMany({ where: { title } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("admin invitation is accepted and the new user can sign in", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful auth flow runs once");
  test.setTimeout(60_000);
  const adminEmail = `e2e-inviter-${Date.now()}@example.test`;
  const inviteEmail = `e2e-invitee-${Date.now()}@example.test`;
  const adminPassword = "E2E-Inviter-Secret-42!";
  const invitePassword = "E2E-Invitee-Secret-42!";
  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "E2E Inviter", passwordHash: await bcrypt.hash(adminPassword, 12), role: "SUPER_ADMIN" },
  });
  let inviteeId: string | null = null;
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(adminEmail);
    await page.locator('input[name="password"]').fill(adminPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    const invited = await page.request.post("/api/admin/invitations", {
      data: { email: inviteEmail, role: "CONTRIBUTOR" },
    });
    expect(invited.status(), await invited.text()).toBe(200);
    const payload = await invited.json();
    expect(payload.acceptToken).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.acceptPath).toContain("/accept-invite?token=");

    await page.context().clearCookies();
    await page.goto(payload.acceptPath);
    await page.locator('input[name="name"]').fill("E2E Invitee");
    await page.locator('input[name="password"]').fill(invitePassword);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/account created/i)).toBeVisible({ timeout: 15_000 });

    const created = await prisma.user.findUnique({ where: { email: inviteEmail } });
    expect(created?.role).toBe("CONTRIBUTOR");
    inviteeId = created?.id || null;

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(inviteEmail);
    await page.locator('input[name="password"]').fill(invitePassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  } finally {
    await prisma.adminInvitation.deleteMany({ where: { email: { in: [adminEmail, inviteEmail] } } }).catch(() => undefined);
    if (inviteeId) {
      await prisma.passwordHistory.deleteMany({ where: { userId: inviteeId } }).catch(() => undefined);
      await prisma.notification.deleteMany({ where: { userId: inviteeId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: inviteeId } }).catch(() => undefined);
    }
    await prisma.notification.deleteMany({ where: { userId: admin.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => undefined);
  }
});

test("ops dashboard is visible to super admins and blocked for contributors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "ops access runs once");
  test.setTimeout(90_000);
  const superEmail = `e2e-ops-super-${Date.now()}@example.test`;
  const contribEmail = `e2e-ops-contrib-${Date.now()}@example.test`;
  const password = "E2E-Ops-Dashboard-42!";
  const superUser = await prisma.user.create({
    data: { email: superEmail, name: "E2E Ops Super", passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" },
  });
  const contrib = await prisma.user.create({
    data: { email: contribEmail, name: "E2E Ops Contrib", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR" },
  });
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(superEmail);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\/ops/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /operations dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /runtime readiness/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/loading live platform status/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /backup channels/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Operations" }).first()).toBeVisible();
    await page.getByRole("tab", { name: /^sites$/i }).click();
    await expect(page.getByRole("heading", { name: /sites and map pins/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /upload a site/i })).toBeVisible();
    await page.getByRole("tab", { name: /^users$/i }).click();
    await expect(page.getByRole("heading", { name: /users and roles/i })).toBeVisible();
    await page.getByRole("tab", { name: /^overview$/i }).click();
    await expect(page.getByRole("heading", { name: /runtime readiness/i })).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(contribEmail);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    await page.goto("/admin/ops");
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /operations dashboard/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Submissions" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Users & roles" })).toHaveCount(0);
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: [superUser.id, contrib.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [superUser.id, contrib.id] } } }).catch(() => undefined);
  }
});
