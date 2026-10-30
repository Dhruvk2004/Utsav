// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Vercel starts functions with --no-experimental-require-module, so a CommonJS dependency that
 * requires an ESM-only package crashes every server route with ERR_REQUIRE_ESM. firebase-admin's
 * jwks-rsa requires jose, hence the override in package.json.
 */
function underVercelFlag(script: string): string {
  return execFileSync(process.execPath, ["--no-experimental-require-module", "-e", script], { encoding: "utf8" });
}

describe("server modules load the way Vercel runs them", () => {
  it.each(["firebase-admin/app", "firebase-admin/auth", "firebase-admin/firestore", "@google/genai"])("%s", (name) => {
    expect(underVercelFlag(`require(${JSON.stringify(name)}); console.log("loaded")`)).toContain("loaded");
  });

  it("jwks-rsa still converts a signing key with the overridden jose", () => {
    const script = `
      const { generateKeyPairSync } = require("node:crypto");
      const { retrieveSigningKeys } = require("jwks-rsa/src/utils");
      const jwk = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "jwk" });
      retrieveSigningKeys([{ ...jwk, kid: "k1", use: "sig", alg: "RS256" }]).then(([key]) => console.log(key.kid, key.getPublicKey().split("\\n")[0]));
    `;
    expect(underVercelFlag(script)).toContain("k1 -----BEGIN PUBLIC KEY-----");
  });
});
