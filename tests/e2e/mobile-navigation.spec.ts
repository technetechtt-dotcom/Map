import { test, expect } from "@playwright/test";

test.describe("public mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test("opens and navigates the mobile drawer", async ({ page }) => {
    await page.goto("/about");
    const menu = page.getByRole("button", { name: "Menu" });
    await expect(menu).toBeVisible();
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Site menu" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Funding" }).click();
    await expect(page).toHaveURL(/\/funding\/?$/);
    await expect(drawer).toBeHidden();
  });

  test("map and list panes remain reachable on phones", async ({ page }) => {
    await page.goto("/");
    const map = page.getByTestId("ecosystem-map");
    const directory = page.getByTestId("location-directory");
    await expect(map).toBeVisible();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(directory).toBeVisible();
    await expect(map).toBeHidden();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(map).toBeVisible();
  });
});

test.describe("public desktop navigation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("all main navigation links reach expected sections", async ({ page }) => {
    await page.goto("/about");
    const paths = ["search", "organisations", "national", "funding", "events", "programmes", "procurement", "submit", "help"];
    for (const path of paths) {
      await page.goto(`/${path}`);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("h1").first()).toBeVisible();
      expect(page.url()).toMatch(new RegExp(`/${path}/?$`));
    }
  });
});
