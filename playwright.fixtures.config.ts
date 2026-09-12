import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-fixtures",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    timezoneId: "America/Argentina/Buenos_Aires",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec vite --config browser-fixtures/vite.config.ts",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: !process.env.CI,
  },
});
