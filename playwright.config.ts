import { defineConfig, devices } from "@playwright/test";

const publicBase = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const opsBase = process.env.PLAYWRIGHT_OPS_BASE_URL || "http://127.0.0.1:3001";

const e2eEnv = {
  E2E: "1",
  NODE_ENV: "development",
  ENFORCE_ENV_VALIDATION: "0",
  CAPTCHA_DISABLED: "1",
  GEOCODER_DISABLED: "1",
  RATE_LIMIT_ALLOW_MEMORY: "1",
  ALLOW_DEMO_USERS: "0",
  MFA_ENFORCE: "0",
  CSP_STRICT: "0",
  HIBP_DISABLED: "1",
  DATABASE_URL: process.env.DATABASE_URL || "",
  DIRECT_URL: process.env.DIRECT_URL || "",
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "ci-test-secret-not-for-production-use-32ch",
  BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || "ci-backup-encryption-key-min-16",
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY || "ci-mfa-encryption-key-at-least-32-characters",
  CRON_SECRET: process.env.CRON_SECRET || "ci-cron-secret-for-e2e-tests-only",
  METRICS_TOKEN: process.env.METRICS_TOKEN || "ci-metrics-token-for-e2e-tests",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
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
      command: "node scripts/dev-platform.js public",
      url: publicBase,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ...process.env, ...e2eEnv, PORT: "3000" },
    },
    {
      command: "node scripts/dev-platform.js ops",
      url: opsBase,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ...process.env, ...e2eEnv, PORT: "3001" },
    },
  ],
  projects: process.env.CI
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        { name: "android", use: { ...devices["Pixel 7"] } },
        { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
      ],
});
