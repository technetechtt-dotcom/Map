import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const path of ["/", "/login", "/organisations", "/rights", "/privacy"]) {
  test(`${path} has no automatically detectable WCAG 2.2 A/AA violations`, async ({ page }) => {
    await page.goto(path);
    const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
    if (path === "/") builder.exclude(".leaflet-container");
    const results = await builder.analyze();
    expect(results.violations, results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  });
}

test("keyboard navigation exposes a visible focus target", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
