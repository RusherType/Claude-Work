import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets the suite run beside another app already on 3000. reuseExistingServer
// would otherwise test whatever happens to be listening there.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // E2E_PROD=1 tests the production build (run `pnpm build` first); CI always does.
    command: process.env.E2E_PROD
      ? `pnpm start --port ${port}`
      : `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
