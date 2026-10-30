// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRepo } from "@/lib/server/repos/users";
import { NOW, NOW_S, testDeps, TODAY, type TestDeps } from "../../helpers/server";

/** The loaders read the request through next/headers and the shared runtime; both are stood in for. */
const request = vi.hoisted(() => ({ cookie: null as string | null, path: null as string | null, ip: "1.2.3.4" }));
const shared = vi.hoisted(() => ({ deps: null as TestDeps | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "__session" && request.cookie ? { value: request.cookie } : undefined) }),
  headers: async () => new Headers({ ...(request.path ? { "x-utsav-path": request.path } : {}), "x-forwarded-for": request.ip }),
}));
vi.mock("@/lib/server/runtime", () => ({ runtime: () => shared.deps }));
/** Records when the loaders yield to `io()`, so clock reads can be checked to come after it (QA-10). */
const calls = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ io: async () => void calls.push("io") }));

const { getSession, guardTarget, sessionFor, viewerFor } = await import("@/lib/server/loaders/viewer");
const { loadSharedPlan } = await import("@/lib/server/loaders/share");

beforeEach(() => {
  shared.deps = testDeps();
  Object.assign(request, { cookie: null, path: null, ip: "1.2.3.4" });
  calls.length = 0;
});

describe("viewer", () => {
  it("is signed out without a verified session or without Firebase", async () => {
    const deps = shared.deps as TestDeps;
    expect(await sessionFor(null, "read", deps)).toBeNull();
    expect(await sessionFor("x", "read", { ...deps, sessions: null })).toBeNull();
    expect(await viewerFor(null, deps)).toBe("signed_out");
    expect(await viewerFor({ uid: "u1", email: "", name: "", picture: null }, { ...deps, db: null })).toBe("signed_out");
  });

  it("is onboarded once the profile has onboardedAt", async () => {
    const deps = shared.deps as TestDeps;
    const session = { uid: "u1", email: "", name: "", picture: null };
    // Sign-in creates the profile, so a verified session without one (a deleted account) is signed out (SEC-03).
    expect(await viewerFor(session, deps)).toBe("signed_out");
    await new UserRepo(deps.db).ensure("u1", { displayName: "", photoURL: null, email: "" }, TODAY, NOW);
    expect(await viewerFor(session, deps)).toBe("not_onboarded");
    await new UserRepo(deps.db).savePatch(
      "u1",
      { displayName: "", photoURL: null, email: "" },
      { markOnboarded: true },
      { today: TODAY, now: NOW },
    );
    expect(await viewerFor(session, deps)).toBe("onboarded");
  });

  it("reads the session cookie for server components", async () => {
    request.cookie = `session:u1:${NOW_S}`;
    expect(await getSession("read")).toMatchObject({ uid: "u1" });
  });

  it("yields to io() before verifying, so the clock is never read while prerendering (QA-10 regression)", async () => {
    const deps = shared.deps as TestDeps;
    const verify = vi.spyOn(deps.sessions as NonNullable<TestDeps["sessions"]>, "verify").mockImplementation(async () => {
      calls.push("verify");
      return null;
    });
    request.cookie = `session:u2:${NOW_S}`;
    await getSession("write");
    expect(calls).toEqual(["io", "verify"]);
    verify.mockRestore();
  });
});

describe("guardTarget", () => {
  it("sends a signed-out visitor to sign-in with the proxy's page path", async () => {
    request.path = "/events/e1?ai=open";
    expect(await guardTarget("app")).toBe("/signin?next=%2Fevents%2Fe1%3Fai%3Dopen");
  });

  it("falls back to the route's own path, and reads ?rerun and ?next from search params", async () => {
    expect(await guardTarget("onboarding", Promise.resolve({ rerun: "1" }))).toBe("/signin?next=%2Fonboarding");
    expect(await guardTarget("app")).toBe("/signin?next=%2Fdashboard");
    expect(await guardTarget("signin", Promise.resolve({ next: ["/events/e1", "/x"] }))).toBeNull();
  });
});

describe("loadSharedPlan", () => {
  it("is a 404 for a malformed token, using the caller's IP for the rate limit", async () => {
    expect(await loadSharedPlan("demo")).toEqual({ kind: "not_found" });
  });

  it("yields to io() before the rate limiter reads the clock (QA-10 regression)", async () => {
    const deps = shared.deps as TestDeps;
    const check = vi.spyOn(deps.limits.share, "check").mockImplementation(() => {
      calls.push("rate-limit");
      return { allowed: true, retryAfterSeconds: 0 } as ReturnType<TestDeps["limits"]["share"]["check"]>;
    });
    await loadSharedPlan("a".repeat(43));
    expect(calls.slice(0, 2)).toEqual(["io", "rate-limit"]);
    check.mockRestore();
  });
});
