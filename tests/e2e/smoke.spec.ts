import { test, expect } from "@playwright/test";

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
