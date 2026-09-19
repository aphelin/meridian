import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.STORE_PORT ?? 3100);
const baseURL = process.env.STORE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Specs share one backend and some inject chaos (e.g. smtp.send), so files must never run concurrently.
  workers: 1,
  retries: 0,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${port}`,
    env: { NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? `.next-e2e-${port}` },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
