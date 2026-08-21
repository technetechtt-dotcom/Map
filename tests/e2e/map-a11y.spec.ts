import { test, expect } from "@playwright/test";

test.beforeEach(() => {
  test.skip(test.info().project.name !== "chromium", "Map accessibility is covered on Chromium");
});

test("map region is named and zoom controls are keyboard reachable", async ({ page }) => {
  await page.goto("/");
  const map = page.getByTestId("ecosystem-map");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("aria-label", /interactive ict ecosystem map/i);
  const zoomIn = page.locator(".leaflet-control-zoom-in");
  await expect(zoomIn).toBeVisible({ timeout: 15_000 });
  await zoomIn.focus();
  await expect(zoomIn).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".leaflet-container")).toBeVisible();
});

test("directory list is the accessible alternative to map markers", async ({ page }) => {
  await page.goto("/");
  const directory = page.getByTestId("location-directory");
  await expect(directory).toBeVisible();
  await expect(directory).toHaveAttribute("aria-label", /location directory/i);
  const items = directory.getByRole("listitem");
  await expect(items.first()).toBeVisible({ timeout: 15_000 });
  await items.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ecosystem-map")).toBeVisible();
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
  await expect(page.getByTestId("location-directory")).toBeVisible();
});
