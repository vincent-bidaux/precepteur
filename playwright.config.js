import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const PORT = 4318;
const chromium = "/opt/pw-browsers/chromium";
const launchOptions = fs.existsSync(chromium) ? { executablePath: chromium } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, launchOptions, trace: "retain-on-failure" },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: [
    {
      // faux serveur Claude (génération de leçons)
      command: "node tests/e2e/mock-claude.mjs",
      port: 4319,
      reuseExistingServer: false,
    },
    {
      // build de prod + API locale sur un stockage fichier jetable
      command: `rm -rf .data-e2e && npm run build && PRECEPTEUR_FS_STORE=.data-e2e ANTHROPIC_API_KEY=cle-de-test PRECEPTEUR_ANTHROPIC_URL=http://localhost:4319 npx vite preview --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
