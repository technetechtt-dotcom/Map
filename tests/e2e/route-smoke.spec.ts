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

test("public map does not serve admin login inline", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/127\.0\.0\.1:3001\/login/);
});
