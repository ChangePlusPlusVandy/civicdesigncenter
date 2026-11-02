import { defineConfig, devices } from "@playwright/test";

// Real browsers against the production build: the server serves the built
// client and the sandbox from one origin, as on the droplet.
const PORT = 4321;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1366, height: 768 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && NODE_ENV=production PORT=${PORT} npm start`,
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
