import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
// A dedicated port, not 3000. reuseExistingServer silently adopts whatever is
// already listening, so sharing a port with `pnpm dev` made the suite run
// against live data and fail demo-only assertions.
const e2ePort = 3100;
const localBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `DATABASE_URL= FOOTBALL_DATA_API_TOKEN= OPENAI_API_KEY= MATCHDAY_DATA_MODE=demo PORT=${e2ePort} pnpm start`,
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
