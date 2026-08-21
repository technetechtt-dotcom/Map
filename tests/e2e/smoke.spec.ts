import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { totpCode } from "../../src/lib/totp";

const prisma = new PrismaClient();

test("home page renders", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
});

test("health endpoint is ok or degraded", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(["ok", "degraded", "maintenance"]).toContain(body.status);
});

test("invalid login stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("nobody@example.com");
  await page.locator('input[name="password"]').fill("definitely-wrong-pass");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 10_000 });
});

test("framework scripts load under strict nonce CSP", async ({ page }) => {
  test.setTimeout(60_000);
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] || "";
  expect(csp).toContain("'strict-dynamic'");
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  const nonces = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script[src]")).map((element) => (element as HTMLScriptElement).nonce || element.getAttribute("nonce") || "")
  );
  expect(nonces.length).toBeGreaterThan(0);
  expect(nonces.every((value) => value === nonce)).toBe(true);
  expect(messages.filter((message) => /content security policy/i.test(message))).toEqual([]);
});

test("public map remains usable on a slow connection", async ({ page }) => {
  await page.route("**/api/{locations,meta,organisations}**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("successful login reaches the admin area", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful auth flow runs once");
  const email = `e2e-login-${Date.now()}@example.test`;
  const password = "E2E-Strong-Password-42!";
  const user = await prisma.user.create({
    data: { email, name: "E2E Login", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR" },
  });
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("MFA enrollment, TOTP login, recovery login and disable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful MFA flow runs once");
  const email = `e2e-mfa-${Date.now()}@example.test`;
  const password = "E2E-Mfa-Password-42!";
  const user = await prisma.user.create({
    data: { email, name: "E2E MFA", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR" },
  });
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    const setup = await page.request.post("/api/auth/mfa", { data: {} });
    expect(setup.ok()).toBeTruthy();
    const enrollment = await setup.json();
    const enabled = await page.request.put("/api/auth/mfa", {
      data: { action: "enable", code: totpCode(enrollment.secret) },
    });
    expect(enabled.ok()).toBeTruthy();
    const recoveryCodes = (await enabled.json()).recoveryCodes as string[];
    expect(recoveryCodes.length).toBeGreaterThan(0);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="mfaCode"]').fill(totpCode(enrollment.secret));
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="mfaCode"]').fill(recoveryCodes[0]);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    const disabled = await page.request.put("/api/auth/mfa", {
      data: { action: "disable", password, existingMfaCode: totpCode(enrollment.secret) },
    });
    expect(disabled.ok()).toBeTruthy();
  } finally {
    await prisma.notification.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("map search, province switching and radius search return safe public data", async ({ request }) => {
  const meta = await request.get("/api/meta?province=northern-cape");
  expect(meta.ok()).toBeTruthy();
  expect(((await meta.json()).provinces as unknown[]).length).toBe(9);

  const results = await request.get("/api/locations?province=northern-cape&q=ICT&lat=-28.738&lng=24.763&radiusKm=50&limit=20");
  expect(results.ok()).toBeTruthy();
  const body = await results.json();
  expect(body.query.spatialMode).toMatch(/postgis|fallback/);
  for (let index = 1; index < body.locations.length; index += 1) {
    expect(body.locations[index].distanceKm).toBeGreaterThanOrEqual(body.locations[index - 1].distanceKm);
  }
});
