import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const e2eTestSecret = process.env.E2E_TEST_SECRET ?? "e2e-test-secret";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      E2E_TEST_MODE: "true",
      E2E_TEST_SECRET: e2eTestSecret,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-auth-secret-e2e-only-auth-secret",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "e2e-client-id",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "e2e-client-secret"
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
