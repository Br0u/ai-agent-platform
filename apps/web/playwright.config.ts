import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3000";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../artifacts/playwright/test-results",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "../../artifacts/playwright/report", open: "never" },
    ],
  ],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm start",
        url: `${baseURL}/api/health/live`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
