import { defineConfig, devices } from "@playwright/test";
import { NO_FIREBASE_WEB_CONFIG } from "./playwright.config";

/**
 * Signed-in E2E (spec 12.4, F-25): the production build against the Firebase Auth and Firestore
 * emulators, with a scripted Gemini. Run it with `npm run test:e2e:emulators`, which starts the
 * emulators (firebase.e2e.json, ports 3480-3484) around this config. Nothing here exists in
 * production: sign-in uses the Auth emulator's Google IdP and the real `POST /api/session`.
 */

const PORT = Number(process.env.E2E_PORT ?? 3461);
const FAKE_GOOGLE_PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 3462);
const BASE_URL = `http://localhost:${PORT}`;
process.env.E2E_BASE_URL = BASE_URL;

const emulators = {
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:3480",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:3481",
};

export default defineConfig({
  testDir: "./e2e/signed-in",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Each test signs in as its own user; a few workers keep the emulators and the AI limits calm.
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-emulators" }]] : "list",
  // Traces only in CI: they are large and local disks fill up.
  use: { baseURL: BASE_URL, trace: process.env.CI ? "retain-on-failure" : "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /a11y\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `node e2e/signed-in/fakeGoogle.mjs`,
      url: `http://127.0.0.1:${FAKE_GOOGLE_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_GOOGLE_PORT: String(FAKE_GOOGLE_PORT) },
    },
    {
      // CI builds once for both E2E runs and sets E2E_SKIP_BUILD here.
      command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}npx next start -p ${PORT}`,
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        // Sign-in goes through the Auth emulator and POST /api/session, not the Firebase web config.
        ...NO_FIREBASE_WEB_CONFIG,
        ...emulators,
        FIREBASE_PROJECT_ID: "demo-utsav",
        APP_ORIGIN: BASE_URL,
        // The scripted Gemini (see fakeGoogle.mjs), reached through the SDK's own base-URL override.
        GEMINI_API_KEY: "e2e-fake-key",
        GOOGLE_GENAI_USE_VERTEXAI: "false",
        GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${FAKE_GOOGLE_PORT}`,
        // No credentials: under the emulator the Admin SDK uses gRPC and needs none (QA-08).
        METADATA_SERVER_DETECTION: "none",
      },
    },
  ],
});
