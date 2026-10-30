import { defineConfig } from "vitest/config";

/**
 * Firebase emulator suites (spec 12.4 "Firestore", F-25): security rules with
 * @firebase/rules-unit-testing, and the Admin SDK adapters (`adminServices`, `firestoreDb`) under
 * the real route handlers. Run with `npm run test:emulator`, which starts the Auth and Firestore
 * emulators (firebase.e2e.json) around this config. Not part of `npm test` or its coverage gate:
 * the adapters it exercises are the closed coverage excludes.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/emulator/**/*.test.ts"],
    globalSetup: ["./tests/emulator/globalSetup.ts"],
    restoreMocks: true,
    // One Firestore emulator for every file: run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:3480",
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:3481",
      // No credentials: under the emulator the Admin SDK uses gRPC and needs no ADC (QA-08).
      METADATA_SERVER_DETECTION: "none",
    },
    hookTimeout: 60_000,
  },
});
