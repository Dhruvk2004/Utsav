import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Emulator suites need the Firebase emulators: `npm run test:emulator` (vitest.emulator.config.mts).
    exclude: [...configDefaults.exclude, "tests/emulator/**"],
    restoreMocks: true,
    unstubGlobals: true,
    // Route-handler and component suites run real transactions and user events; leave headroom on a busy CI host.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // The closed list from spec 12.4; tests/architecture.test.ts keeps the shells and routes thin.
      exclude: [
        // Thin Admin SDK adapters behind the `Db` and `SessionAuth` interfaces (repositories are tested on MemoryDb).
        "src/lib/server/firebase/**",
        // Firebase web SDK loader (popup/redirect wrapper); the sign-in logic is in firebaseAuthClient.ts.
        "src/lib/firebase/client.ts",
        "src/app/**/route.ts",
        "src/app/**/{page,layout,loading,error,global-error,not-found}.tsx",
        "src/app/{icon,apple-icon,opengraph-image}.*",
        // Its decisions are `proxyRedirect` and `isShareToken`, tested in tests/unit/guards.test.ts.
        "src/proxy.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
});
