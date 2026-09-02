import { defineConfig, devices } from "@playwright/test";

const publicBase = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const opsBase = process.env.PLAYWRIGHT_OPS_BASE_URL || "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: publicBase,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: process.env.CI ? "node scripts/dev-platform.js public --start" : "node scripts/dev-platform.js public",
      url: publicBase,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: process.env.CI ? "node scripts/dev-platform.js ops --start" : "node scripts/dev-platform.js ops",
      url: opsBase,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],
});
