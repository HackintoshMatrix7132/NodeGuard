import { defineConfig, devices } from "@playwright/test";

const apiPort = 3210;
const webPort = 4174;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "true";

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 12_000,
  },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "npm run build --workspace apps/api && node apps/web/e2e/start-api.mjs",
      cwd: process.cwd(),
      url: `${apiUrl}/health`,
      reuseExistingServer,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      env: {
        NODE_ENV: "test",
        NODEGUARD_HOST: "127.0.0.1",
        PORT: String(apiPort),
        DATABASE_URL: ":memory:",
        NODEGUARD_ADMIN_USERNAME: "e2e-owner",
        NODEGUARD_ADMIN_PASSWORD: "e2e-owner-password",
        NODEGUARD_DEMO_USERNAME: "demo",
        NODEGUARD_DEMO_PASSWORD: "demo",
        NODEGUARD_INTEGRATION_SECRET: "nodeguard-e2e-integration-secret-32-bytes",
        NODEGUARD_API_KEY: "",
        SESSION_COOKIE_SECURE: "false",
        ALLOWED_ORIGINS: webUrl,
        MONITORED_DOMAINS: "",
        DOMAIN_CHECK_TIMEOUT_MS: "1000",
        METRIC_SAMPLE_INTERVAL_SECONDS: "3600",
        NODEGUARD_PROXMOX_SYNC_INTERVAL_SECONDS: "3600",
      },
    },
    {
      command: `npm run build --workspace apps/web && npm run preview --workspace apps/web -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: process.cwd(),
      url: webUrl,
      reuseExistingServer,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      env: {
        VITE_NODEGUARD_API_URL: apiUrl,
      },
    },
  ],
});
