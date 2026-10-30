// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDeployableEnv, TEST_ONLY_ENV } from "@/lib/config";
import { createServerDeps } from "@/lib/server/runtime";

/**
 * The signed-in E2E run needs no test-only code in the app (docs/qa-report.md, "Signed-in E2E"):
 * sign-in goes through the Auth emulator and the real `POST /api/session`, and the scripted Gemini
 * is reached through the Gemini SDK's own base-URL variable (no credentials are faked). These checks
 * keep it that way: no seam, flag or route that production could switch on.
 */

const SRC = join(process.cwd(), "src");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const SEAMS = [
  /UTSAV_E2E/,
  /UTSAV_FAKE_MODEL/,
  /fakeGoogle/,
  /signInForTest|testSession|__e2e/i,
  /GOOGLE_GEMINI_BASE_URL|GCE_METADATA_HOST/,
];

describe("no test seams in the app", () => {
  it.each(sources(SRC).map((f) => [relative(process.cwd(), f), f]))("%s has no test-only switch", (_, file) => {
    // The one allowed mention is the list a deployed server refuses (SEC-09), checked below.
    const source = readFileSync(file, "utf8").replace(/^export const TEST_ONLY_ENV = \[[^\]]*\] as const;$/m, "");
    for (const seam of SEAMS) expect(source).not.toMatch(seam);
  });

  it("the test-only settings are named only to be refused on Cloud Run", () => {
    expect(TEST_ONLY_ENV).toEqual(
      expect.arrayContaining(["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "GOOGLE_GEMINI_BASE_URL"]),
    );
    const uses = sources(SRC).filter((file) => readFileSync(file, "utf8").includes("TEST_ONLY_ENV"));
    expect(uses.map((file) => relative(SRC, file))).toEqual(["lib/config.ts"]);
    for (const name of TEST_ONLY_ENV) expect(() => assertDeployableEnv({ K_SERVICE: "utsav", [name]: "127.0.0.1:1" })).toThrow(name);
  });

  it("there is no session route other than the Google ID-token exchange", () => {
    const api = join(SRC, "app/api");
    const routes = sources(api).map((f) => relative(api, f));
    expect(routes.filter((r) => /session|auth|login|test/i.test(r))).toEqual(["session/route.ts"]);
  });

  it("with no Firebase project the server has no database or auth at all, emulator hosts or not", () => {
    const deps = createServerDeps({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:3480", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:3481" });
    expect([deps.db, deps.auth, deps.sessions]).toEqual([null, null, null]);
  });
});
