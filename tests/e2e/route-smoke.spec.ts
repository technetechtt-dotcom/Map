import { test, expect } from "@playwright/test";
import { opsUrl } from "./helpers/urls";

const publicRoutes = [
  "/",
  "/about",
  "/organisations",
  "/national",
  "/funding",
  "/events",
  "/programmes",
  "/procurement",
  "/submit",
  "/rights",
  "/privacy",
  "/terms",
];

const opsRoutes = ["/login", "/admin", "/admin/ops", "/admin/data-quality", "/admin/review"];

for (const path of publicRoutes) {
  test(`public route smoke ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });
}

for (const path of opsRoutes) {
  test(`ops route smoke ${path}`, async ({ page }) => {
    const res = await page.goto(opsUrl(path));
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });
}

test("public and ops both serve login", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.goto(opsUrl("/login"));
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});
