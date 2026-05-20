import { defineConfig, devices } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  // Visual snapshots — first post-migration run writes the baseline,
  // subsequent runs diff against it (validator prediction p5).
  updateSnapshots: "missing",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  // Boot both services if they aren't already up. `reuseExistingServer` means
  // the cycle-2-criteria.sh harness (which also boots dev for criterion 9) and
  // a bare `bun run test:e2e` both work — Playwright reuses a running server
  // or starts its own.
  webServer: {
    command: "bun run dev",
    url: `${APP_URL}/`,
    cwd: "..",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
