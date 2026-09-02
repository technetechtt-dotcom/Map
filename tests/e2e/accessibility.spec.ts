import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { opsUrl } from "./helpers/urls";

const publicPaths = ["/", "/organisations", "/rights", "/privacy"] as const;

for (const path of publicPaths) {
  test(`${path} has no automatically detectable WCAG 2.2 A/AA violations`, async ({ page }) => {
    await page.goto(path);
    const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
    if (path === "/") builder.exclude(".leaflet-container");
    const results = await builder.analyze();
    expect(results.violations, results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  });
}

test("/login on the ops console has no automatically detectable WCAG 2.2 A/AA violations", async ({ page }) => {
  await page.goto(opsUrl("/login"));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
});

test("keyboard navigation exposes a visible focus target", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
