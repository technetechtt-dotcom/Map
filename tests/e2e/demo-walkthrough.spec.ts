import { test, expect } from "@playwright/test";
import { opsUrl } from "./helpers/urls";

const password = (process.env.SEED_ADMIN_PASSWORD || "").trim();
const superEmail = process.env.SEED_ADMIN_EMAIL || process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "admin@ictmap.gov.za";
const provincialEmail =
  process.env.SEED_NC_ADMIN_EMAIL || process.env.NEXT_PUBLIC_DEMO_PROVINCIAL_EMAIL || "nc.admin@ictmap.gov.za";

test.describe("10-minute investor walkthrough", () => {
  test("about, map, contacts, national, then both demo logins", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "walkthrough runs once");
    test.skip(password.length < 12, "SEED_ADMIN_PASSWORD is required for the signed-in minutes");
    test.setTimeout(90_000);

    await page.goto("/about");
    await expect(page.getByRole("heading", { name: /SA ICT Ecosystem Map/i })).toBeVisible();
    await expect(page.getByText(/published or verified sites/i)).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Map directory/i })).toBeVisible({ timeout: 20_000 });
    const townsChip = page.getByRole("button", { name: /Towns \(/ });
    await expect(townsChip).toBeVisible({ timeout: 20_000 });

    await page.goto("/organisations");
    await expect(page.getByRole("heading", { name: /organisations/i })).toBeVisible();

    await page.goto("/national");
    await expect(page.getByRole("heading", { name: /National search/i })).toBeVisible();
    await expect(page.getByText(/live counts from the shared catalogue/i)).toBeVisible();

    await page.goto(opsUrl("/login"));
    await page.locator('input[name="email"]').fill(superEmail);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3001\/admin/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /operations dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Operations" }).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /^sites$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^users$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users & roles" })).toHaveCount(0);

    await page.goto(opsUrl("/admin/locations"));
    await expect(page.getByRole("heading", { name: /locations/i })).toBeVisible({ timeout: 15_000 });

    await page.goto(opsUrl("/admin/ops"));
    await expect(page.getByRole("heading", { name: /operations dashboard/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3001\/login/, { timeout: 15_000 });

    await page.goto(opsUrl("/login"));
    await page.locator('input[name="email"]').fill(provincialEmail);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3001\/admin/, { timeout: 20_000 });
    await page.goto(opsUrl("/admin/ops"));
    await expect(page.getByRole("heading", { name: /operations dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Backups" })).toHaveCount(0);
  });
});
