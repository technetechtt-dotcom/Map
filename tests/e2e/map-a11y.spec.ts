import { test, expect } from "@playwright/test";

test.beforeEach(() => {
  test.skip(test.info().project.name !== "chromium", "Map accessibility is covered on Chromium");
});

test("map region is named and zoom controls are reachable", async ({ page }) => {
  await page.goto("/");
  const map = page.getByTestId("ecosystem-map");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("aria-label", /interactive ict ecosystem map/i);
  await expect(page.locator(".leaflet-control-zoom-in")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".leaflet-control-zoom-out")).toBeVisible();
  await page.locator(".leaflet-control-zoom-in").click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
});

test("skip link moves focus into main content beside the map", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.getByTestId("ecosystem-map")).toBeVisible();
});
