import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * The test build never takes the owner's Firebase web config from .env.production: an empty value in
 * the environment wins over the file, so the suite always sees the "sign-in isn't configured" build.
 */
export const NO_FIREBASE_WEB_CONFIG = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "",
  NEXT_PUBLIC_FIREBASE_APP_ID: "",
};

export default defineConfig({
  testDir: "./e2e",
  // Signed-in flows need the Firebase emulators: `npm run test:e2e:emulators` (playwright.emulators.config.ts).
  testIgnore: "signed-in/**",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Runs the production build with no AI configured, so plans come from the deterministic template.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { GEMINI_API_KEY: "", GOOGLE_GENAI_USE_VERTEXAI: "false", ...NO_FIREBASE_WEB_CONFIG },
  },
});
