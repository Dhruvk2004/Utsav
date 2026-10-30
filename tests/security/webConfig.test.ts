// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import { register } from "@/instrumentation";
import { afterSignInPath, HOME_PATH, safeNextPath } from "@/lib/client/navigation";
import { buildIcs, escapeIcsText } from "@/lib/domain/ics";
import { APP_CSP_SOURCES, appCsp, AUTH_HELPER_HEADERS, firebaseHelperUrl, PUBLIC_CSP_SOURCE, publicCsp } from "@/lib/server/csp";
import { createServerDeps } from "@/lib/server/runtime";
import { wedding } from "../domainFixtures";

/**
 * Penetration-test regressions (docs/qa-report.md, "Penetration test"): open redirects, `.ics`
 * injection, CSP, and repository and image hygiene. Each SEC-xx test was an `it.fails` marker for a
 * confirmed finding; the findings are fixed, so they are ordinary tests now.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("open redirects through ?next= (spec 3.1)", () => {
  const LEAVES_SITE = (target: string) => new URL(target, "https://utsav.app").origin !== "https://utsav.app";

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\t/x?a",
    "javascript:alert(1)",
    "%2F%2Fevil.example",
    "///evil.example",
    "http:evil.example",
    " //evil.example",
  ])("%j falls back to the dashboard", (next) => {
    expect(LEAVES_SITE(safeNextPath(next))).toBe(false);
    expect(LEAVES_SITE(afterSignInPath(true, next))).toBe(false);
  });

  it.each(["/events/abc/budget?ai=open", "/settings", "/events/x?a=//evil.example", "/%2F%2Fevil.example"])(
    "%j is kept as a same-site path",
    (next) => {
      expect(LEAVES_SITE(safeNextPath(next))).toBe(false);
    },
  );

  it.each([
    "/.//evil.example",
    "/..//evil.example",
    "/x/..//evil.example",
    "/%2e//evil.example",
    "/./\\evil.example",
    "/a/../\\/evil.example",
    "/%2E%2E//evil.example",
  ])("SEC-01: dot segments in %j do not normalise into a protocol-relative URL", (next) => {
    expect(safeNextPath(next)).not.toMatch(/^\/[/\\]/);
    expect(safeNextPath(next)).toBe(HOME_PATH);
    expect(LEAVES_SITE(afterSignInPath(true, next))).toBe(false);
  });

  it.each(["/\t/", "/\n/", "/\r/", "/\n/\t", "/\t\n/", "/\t\\"])(
    "SEC-17: %j, which the URL parser refuses, falls back instead of throwing",
    (next) => {
      expect(() => new URL(next, "https://utsav.invalid")).toThrow(TypeError);
      expect(safeNextPath(next)).toBe(HOME_PATH);
      expect(safeNextPath(next, "/settings")).toBe("/settings");
      expect(afterSignInPath(true, next)).toBe(HOME_PATH);
      expect(afterSignInPath(false, next)).toBe("/onboarding");
    },
  );

  it("SEC-01: dot segments that stay on the site are still normalised and kept", () => {
    expect(safeNextPath("/events/./abc/../abc/budget?ai=open")).toBe("/events/abc/budget?ai=open");
    expect(safeNextPath("/a/..//settings")).toBe(HOME_PATH);
    // An encoded backslash stays encoded, so the browser reads it as a path segment, not a host.
    expect(safeNextPath("/./%5C/evil.example")).toBe("/%5C/evil.example");
  });
});

describe(".ics export", () => {
  it("escapes commas, semicolons, backslashes and newlines in text values", () => {
    expect(escapeIcsText("a,b;c\\d\ne\r\nf")).toBe("a\\,b\\;c\\\\d\\ne\\nf");
  });

  it("puts every user text on its own escaped line: no CRLF injection from stored text", () => {
    const base = wedding();
    const plan = {
      ...base,
      tasks: base.tasks.map((task, i) =>
        i === 0 ? { ...task, done: false, title: "Book\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:INJECTED" } : task,
      ),
    };
    const ics = buildIcs(plan, "evt", "2026-10-28", new Date("2026-10-28T06:00:00Z"));
    expect(ics.split("\r\n").some((line) => line.startsWith("SUMMARY:INJECTED"))).toBe(false);
  });

  it("SEC-11: a lone carriage return is escaped too", () => {
    expect(escapeIcsText("a\rb")).not.toContain("\r");
    expect(escapeIcsText("a\rb\nc\r\nd")).toBe("a\\nb\\nc\\nd");
  });

  it("SEC-11: a lone CR in a title cannot start a calendar line either", () => {
    const base = wedding();
    const plan = {
      ...base,
      tasks: base.tasks.map((task, i) => (i === 0 ? { ...task, done: false, title: "Book\rSUMMARY:INJECTED" } : task)),
    };
    const ics = buildIcs(plan, "evt", "2026-10-28", new Date("2026-10-28T06:00:00Z"));
    expect(ics.replace(/\r\n/g, "")).not.toContain("\r");
    expect(ics.split(/\r\n|\r|\n/).some((line) => line.startsWith("SUMMARY:INJECTED"))).toBe(false);
  });
});

describe("Content Security Policy (spec 9.1)", () => {
  it.each([
    ["public", publicCsp({ dev: false })],
    ["app", appCsp({ dev: false, firebaseHost: "https://demo.firebaseapp.com" })],
  ])("the %s policy blocks plugins, base and form hijacking, framing and eval", (_, csp) => {
    for (const directive of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "default-src 'self'"])
      expect(csp).toContain(directive);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(script|connect|img|frame)-src[^;]*\*/);
  });

  it("the public policy talks to no third party", () => {
    expect(publicCsp({ dev: false })).not.toMatch(/https:\/\//);
  });

  it("SEC-16: both policies forbid inline event-handler attributes", () => {
    for (const csp of [
      publicCsp({ dev: false }),
      publicCsp({ dev: true }),
      appCsp({ dev: false, firebaseHost: "https://demo.firebaseapp.com" }),
    ])
      expect(csp).toContain("script-src-attr 'none'");
  });

  describe("SEC-10: which header source a path gets (Next.js's own matcher)", () => {
    const matches = (source: string, path: string) => getPathMatch(source, { strict: true })(path) !== false;
    const policiesOf = (path: string) => [PUBLIC_CSP_SOURCE, ...APP_CSP_SOURCES].filter((source) => matches(source, path));

    it.each([
      "/",
      "/eventsx",
      "/signinfoo",
      "/settingsx/y",
      "/dashboardz",
      "/onboardingz",
      "/sx",
      "/demo/wedding",
      "/privacy",
      "/api/health",
      "/no-such-page",
    ])("%s gets the public policy", (path) => {
      expect(policiesOf(path)).toEqual([PUBLIC_CSP_SOURCE]);
    });

    it.each(["/signin", "/onboarding", "/dashboard", "/events", "/events/abc/budget", "/settings", "/s", `/s/${"A".repeat(43)}`])(
      "%s gets the app policy only",
      (path) => {
        expect(policiesOf(path).length).toBeGreaterThan(0);
        expect(policiesOf(path)).not.toContain(PUBLIC_CSP_SOURCE);
      },
    );

    it("Firebase's proxied helper gets neither (its headers come from the proxy, SEC-02)", () => {
      expect(policiesOf("/__/auth/handler")).toEqual([]);
      expect(AUTH_HELPER_HEADERS).toContainEqual(["Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"]);
      expect(AUTH_HELPER_HEADERS).toContainEqual(["X-Content-Type-Options", "nosniff"]);
    });

    it("SEC-02: the proxy rewrites only Firebase's helper paths, to the fixed project host", () => {
      const host = "https://demo-utsav.firebaseapp.com";
      expect(firebaseHelperUrl("/__/auth/handler", "?apiKey=k", host)).toBe(`${host}/__/auth/handler?apiKey=k`);
      expect(firebaseHelperUrl("/__/auth/iframe", "", host)).toBe(`${host}/__/auth/iframe`);
      expect(firebaseHelperUrl("/__/firebase/init.json", "", host)).toBe(`${host}/__/firebase/init.json`);
      for (const path of ["/__/firebase/other", "/__/authx", "/__/", "/api/health"]) expect(firebaseHelperUrl(path, "", host)).toBeNull();
      expect(firebaseHelperUrl("/__/auth/handler", "", "")).toBeNull();
      // Whatever the path, the target stays on the project's host.
      expect(new URL(firebaseHelperUrl("/__/auth/@evil.example/x", "", host)!).host).toBe("demo-utsav.firebaseapp.com");
    });
  });
});

describe("configuration that must never reach production", () => {
  it("SEC-09: emulator hosts are refused on a deployed server (Cloud Run sets K_SERVICE)", () => {
    // With FIREBASE_AUTH_EMULATOR_HOST set, firebase-admin accepts unsigned tokens and cookies for any uid.
    const env = {
      FIREBASE_PROJECT_ID: "utsav-prod",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      K_SERVICE: "utsav",
      NODE_ENV: "production",
    };
    expect(() => createServerDeps(env)).toThrow(/FIREBASE_AUTH_EMULATOR_HOST/);
  });

  it.each(["FIRESTORE_EMULATOR_HOST", "GOOGLE_GEMINI_BASE_URL", "GOOGLE_VERTEX_BASE_URL"])(
    "SEC-09: %s is refused on Cloud Run too",
    (name) => {
      expect(() => createServerDeps({ K_SERVICE: "utsav", GEMINI_API_KEY: "k", [name]: "http://127.0.0.1:1" })).toThrow(name);
    },
  );

  it.each(["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "GOOGLE_GEMINI_BASE_URL"])(
    "SEC-09: %s is refused on Vercel too (Vercel sets VERCEL=1)",
    (name) => {
      expect(() => createServerDeps({ VERCEL: "1", GEMINI_API_KEY: "k", [name]: "http://127.0.0.1:1" })).toThrow(name);
    },
  );

  it("SEC-09: the server refuses to start (instrumentation) and allows the same settings off Cloud Run", () => {
    const saved = { ...process.env };
    try {
      process.env.K_SERVICE = "utsav";
      process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      expect(() => register()).toThrow(/Refusing to start/);
      delete process.env.K_SERVICE;
      expect(() => register()).not.toThrow();
    } finally {
      process.env = saved;
    }
    expect(() => createServerDeps({ FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).not.toThrow();
    expect(() => createServerDeps({ K_SERVICE: "utsav", FIREBASE_AUTH_EMULATOR_HOST: " " })).not.toThrow();
  });
});

describe("repository, image and rules hygiene", () => {
  it("tracked files carry no credentials", () => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((file) => file && !file.startsWith("node_modules/") && !/\.(svg|png|ico|woff2?)$/.test(file));
    const patterns = [
      /AIza[0-9A-Za-z_-]{35}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /"private_key"\s*:/,
      /\bya29\.[0-9A-Za-z_-]{20,}/,
      /\bghp_[0-9A-Za-z]{30,}/,
    ];
    const hits = files.flatMap((file) => {
      let text = "";
      try {
        text = read(file);
      } catch {
        return [];
      }
      return patterns.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`);
    });
    expect(hits).toEqual([]);
  });

  it(".env files and service-account keys stay out of git and the Docker build context", () => {
    for (const file of [".gitignore", ".dockerignore"]) {
      expect(read(file)).toMatch(/^\.env\*$/m);
      expect(read(file)).toMatch(/\*service-account\*\.json/);
    }
  });

  it("SEC-13: the app files are not writable by the app user, and the base image is pinned by digest", () => {
    const dockerfile = read("Dockerfile");
    const run = dockerfile.slice(dockerfile.lastIndexOf("FROM "));
    expect(run).not.toMatch(/--chown/);
    expect(run).toMatch(/^RUN mkdir -p \.next\/cache && chown app:app \.next\/cache$/m);
    for (const [, image] of dockerfile.matchAll(/^FROM (\S+)/gm)) expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
  });

  it("SEC-13: CI has a read-only token and pins every action by commit SHA", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
    const uses = [...ci.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });

  it("SEC-13: keys, certificates and agent settings stay out of the Docker build context", () => {
    const ignore = read(".dockerignore");
    for (const pattern of ["*.pem", "*.key", ".claude"]) expect(ignore.split("\n")).toContain(pattern);
  });

  it("the runtime image runs as a non-root user and bakes in no server secret", () => {
    const dockerfile = read("Dockerfile");
    const run = dockerfile.slice(dockerfile.lastIndexOf("FROM "));
    expect(run).toMatch(/^USER (?!root)\w+/m);
    expect(dockerfile).not.toMatch(/(ARG|ENV)\s+[^\n]*(GEMINI_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|PRIVATE_KEY|SECRET)/);
    // Only the public NEXT_PUBLIC_* Firebase web config is a build argument.
    expect([...dockerfile.matchAll(/^ARG (\w+)/gm)].map((m) => m[1]).every((name) => name.startsWith("NEXT_PUBLIC_FIREBASE_"))).toBe(true);
  });

  it("firestore.rules deny every client read and write", () => {
    const rules = read("firestore.rules").replace(/\/\/.*$/gm, "");
    const allows = [...rules.matchAll(/allow [^;]+;/g)].map((m) => m[0]);
    expect(allows.length).toBeGreaterThan(0);
    for (const allow of allows) expect(allow).toMatch(/:\s*if false;$/);
  });

  it("production dependencies are locked", () => {
    const lock = JSON.parse(read("package-lock.json")) as {
      lockfileVersion: number;
      packages: Record<string, { version?: string; integrity?: string }>;
    };
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(3);
    for (const name of Object.keys(pkg.dependencies)) {
      const entry = lock.packages[`node_modules/${name}`];
      expect(entry?.version, name).toBeTruthy();
      expect(entry?.integrity, name).toMatch(/^sha512-/);
    }
  });
});
