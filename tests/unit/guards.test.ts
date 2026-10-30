// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUARD_PATH_HEADER, guardRedirect, proxyRedirect, routeOf, type GuardedRoute, type Viewer } from "@/lib/guards";
import { eventPageId, eventPageMissing } from "@/lib/server/loaders/eventPage";
import { sessionCookieStale } from "@/lib/server/loaders/staleSession";
import { EventRepo } from "@/lib/server/repos/events";
import { wedding } from "../domainFixtures";
import { sessionCookie, testDeps, type TestDeps } from "../helpers/server";

/** The proxy's ownership check (QA-05) reads the shared runtime; a test double stands in for it. */
const shared = vi.hoisted(() => ({ deps: null as TestDeps | null }));
vi.mock("@/lib/server/runtime", () => ({ runtime: () => shared.deps }));
const { config, proxy } = await import("@/proxy");

beforeEach(() => {
  shared.deps = testDeps();
});

const request = (path: string) => {
  const url = new URL(path, "https://utsav.test");
  return { path, search: url.searchParams };
};

describe("routeOf", () => {
  it.each([
    ["/", "landing"],
    ["/signin", "signin"],
    ["/onboarding", "onboarding"],
    ["/dashboard", "app"],
    ["/events", "app"],
    ["/events/abc/budget", "app"],
    ["/settings", "app"],
    ["/demo", null],
    ["/demo/wedding", null],
    ["/s/abc", null],
    ["/privacy", null],
    ["/eventsfoo", null],
  ])("%s is %s", (path, route) => {
    expect(routeOf(path)).toBe(route);
  });
});

describe("guard table (spec 3.3)", () => {
  const cases: [GuardedRoute, string, Viewer, string | null][] = [
    ["landing", "/", "signed_out", null],
    ["landing", "/", "not_onboarded", "/onboarding"],
    ["landing", "/", "onboarded", "/dashboard"],
    ["signin", "/signin", "signed_out", null],
    ["signin", "/signin", "not_onboarded", "/onboarding"],
    ["signin", "/signin", "onboarded", "/dashboard"],
    ["signin", "/signin?next=/events/e1/budget", "onboarded", "/events/e1/budget"],
    ["signin", "/signin?next=//evil.example", "onboarded", "/dashboard"],
    ["signin", "/signin?next=%2F%09%2F", "onboarded", "/dashboard"],
    ["signin", "/signin?next=%2F%0A%2F", "onboarded", "/dashboard"],
    ["onboarding", "/onboarding", "signed_out", "/signin?next=%2Fonboarding"],
    ["onboarding", "/onboarding?rerun=1", "signed_out", "/signin?next=%2Fonboarding%3Frerun%3D1"],
    ["onboarding", "/onboarding", "not_onboarded", null],
    ["onboarding", "/onboarding?rerun=1", "not_onboarded", null],
    ["onboarding", "/onboarding", "onboarded", "/dashboard"],
    ["onboarding", "/onboarding?rerun=1", "onboarded", null],
    ["app", "/dashboard", "signed_out", "/signin?next=%2Fdashboard"],
    ["app", "/events/e1/budget?ai=open", "signed_out", "/signin?next=%2Fevents%2Fe1%2Fbudget%3Fai%3Dopen"],
    ["app", "/settings", "not_onboarded", "/onboarding"],
    ["app", "/events/new", "onboarded", null],
  ];

  it.each(cases)("%s %s as %s goes to %s", (route, path, viewer, target) => {
    expect(guardRedirect(route, viewer, request(path))).toBe(target);
  });
});

describe("proxyRedirect (cookie presence only)", () => {
  const search = new URLSearchParams();

  it("sends signed-out visitors of private pages to sign-in with the page as ?next=", () => {
    expect(proxyRedirect("/events/e1", new URLSearchParams("ai=open"), false)).toBe("/signin?next=%2Fevents%2Fe1%3Fai%3Dopen");
    expect(proxyRedirect("/onboarding", search, false)).toBe("/signin?next=%2Fonboarding");
  });

  it("leaves public pages, the landing page and sign-in to render when there is no cookie", () => {
    for (const path of ["/", "/signin", "/demo/wedding", "/privacy"]) expect(proxyRedirect(path, search, false)).toBeNull();
  });

  it("with a cookie, skips only the landing page and leaves the rest to the server guard", () => {
    expect(proxyRedirect("/", search, true)).toBe("/dashboard");
    for (const path of ["/signin", "/onboarding", "/dashboard", "/demo"]) expect(proxyRedirect(path, search, true)).toBeNull();
  });
});

describe("proxy", () => {
  const run = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
    proxy(new NextRequest(`https://utsav.test${path}`, { headers: { ...headers, ...(cookie ? { cookie } : {}) } }));

  it("redirects signed-out visitors and passes the page path to the server guard otherwise", async () => {
    expect((await run("/dashboard")).headers.get("location")).toBe("https://utsav.test/signin?next=%2Fdashboard");
    const passed = await run("/events/e1?ai=open", "__session=x");
    expect(passed.headers.get("location")).toBeNull();
    expect(passed.headers.get(`x-middleware-request-${GUARD_PATH_HEADER}`)).toBe("/events/e1?ai=open");
  });

  it("clears a stale session cookie on the landing and sign-in pages instead of bouncing to /dashboard", async () => {
    const cookie = "__session=expired-or-forged";
    const landing = await run("/", cookie);
    expect(landing.headers.get("location")).toBeNull();
    expect(landing.headers.get("set-cookie")).toMatch(/^__session=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax/);
    const signin = await run("/signin", cookie);
    expect(signin.headers.get("location")).toBeNull();
    expect(signin.headers.get("set-cookie")).toMatch(/^__session=;/);
    // A value that does not decode never reaches the redirect either (SEC-05).
    expect((await run("/", "__session=%E0%A4%A")).headers.get("location")).toBeNull();
  });

  it("keeps a valid session cookie: the landing page still skips to the dashboard, and sign-in is left to the server guard", async () => {
    const landing = await run("/", sessionCookie("u1"));
    expect(landing.headers.get("location")).toBe("https://utsav.test/dashboard");
    expect(landing.headers.get("set-cookie")).toBeNull();
    const signin = await run("/signin", sessionCookie("u1"));
    expect(signin.headers.get("location")).toBeNull();
    expect(signin.headers.get("set-cookie")).toBeNull();
  });

  it("checks the cookie only on the landing and sign-in pages", async () => {
    const dashboard = await run("/dashboard", "__session=expired-or-forged");
    expect(dashboard.headers.get("set-cookie")).toBeNull();
    expect((await run("/")).headers.get("set-cookie")).toBeNull();
  });

  it("answers a malformed share token with the 404 page before anything renders", async () => {
    expect((await run("/s/demo")).headers.get("x-middleware-rewrite")).toBe("https://utsav.test/404");
    expect((await run(`/s/${"a".repeat(43)}`)).headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("answers someone else's event page with the 404 page before anything renders (QA-05)", async () => {
    const deps = shared.deps as TestDeps;
    const eventId = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    const rewrite = async (path: string, uid: string, headers?: Record<string, string>) =>
      (await run(path, sessionCookie(uid), headers)).headers.get("x-middleware-rewrite");
    // The owner gets the page, on every tab.
    expect(await rewrite(`/events/${eventId}`, "u1")).toBeNull();
    expect(await rewrite(`/events/${eventId}/budget`, "u1")).toBeNull();
    // Another user, an unknown event and a malformed id get a real 404.
    expect(await rewrite(`/events/${eventId}/budget`, "u2")).toBe("https://utsav.test/404");
    expect(await rewrite("/events/nope/timeline", "u1")).toBe("https://utsav.test/404");
    expect(await rewrite("/events/a.b/", "u1")).toBe("https://utsav.test/404");
    // A client navigation between tabs is not checked: it costs a read and has no visible status.
    expect(await rewrite(`/events/${eventId}/budget`, "u2", { rsc: "1" })).toBeNull();
    // A cookie that does not verify is left to the server guard, which sends the visitor to sign in.
    expect(await rewrite(`/events/${eventId}`, "", {})).toBeNull();
    expect((await run(`/events/${eventId}`, "__session=forged")).headers.get("x-middleware-rewrite")).toBeNull();
    // Creating an event is not an event page.
    expect(await rewrite("/events/new", "u1")).toBeNull();
  });

  it("gives Firebase's proxied auth helper its own framing policy and nosniff, with no redirect (SEC-02)", async () => {
    for (const path of ["/__/auth/handler", "/__/auth/iframe?apiKey=x"]) {
      const response = await run(path, "__session=x");
      expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("runs only on guarded pages, share links and the auth helper", () => {
    expect(config.matcher).toEqual([
      "/",
      "/signin",
      "/onboarding",
      "/dashboard/:path*",
      "/events/:path*",
      "/settings/:path*",
      "/s/:path*",
      "/__/:path*",
    ]);
  });
});

describe("eventPageMissing (QA-05)", () => {
  const page = (path: string, init: RequestInit = {}) =>
    new Request(`https://utsav.test${path}`, { ...init, headers: { cookie: sessionCookie("u2"), ...init.headers } });

  it("knows a workspace page path from any other", () => {
    expect(eventPageId("/events/e1")).toBe("e1");
    expect(eventPageId("/events/e1/")).toBe("e1");
    expect(eventPageId("/events/e1/settings")).toBe("e1");
    for (const path of ["/events", "/events/", "/events/new", "/events/e1/budget/x", "/dashboard"]) expect(eventPageId(path)).toBeNull();
  });

  it("lets the page through when it cannot tell: not a page load, no Firebase, or a failed read", async () => {
    const deps = shared.deps as TestDeps;
    expect(await eventPageMissing(page("/events/e1", { method: "HEAD" }), deps)).toBe(false);
    expect(await eventPageMissing(page("/dashboard"), deps)).toBe(false);
    expect(await eventPageMissing(page("/events/e1"), { ...deps, db: null })).toBe(false);
    expect(await eventPageMissing(page("/events/e1"), { ...deps, sessions: null })).toBe(false);
    expect(await eventPageMissing(page("/events/e1"), deps)).toBe(true);
    vi.spyOn(deps.db, "get").mockRejectedValueOnce(new Error("unavailable"));
    expect(await eventPageMissing(page("/events/e1"), deps)).toBe(false);
  });
});

describe("sessionCookieStale", () => {
  it("is stale when the cookie does not decode or verify, or the deployment has no Firebase", async () => {
    const deps = shared.deps as TestDeps;
    expect(await sessionCookieStale(null, deps)).toBe(true);
    expect(await sessionCookieStale("forged", deps)).toBe(true);
    expect(await sessionCookieStale(decodeURIComponent(sessionCookie("u1").slice("__session=".length)), { ...deps, sessions: null })).toBe(
      true,
    );
  });

  it("is not stale when the cookie verifies, or when the check itself fails", async () => {
    const deps = shared.deps as TestDeps;
    const value = decodeURIComponent(sessionCookie("u1").slice("__session=".length));
    expect(await sessionCookieStale(value, deps)).toBe(false);
    vi.spyOn(deps.sessions as NonNullable<TestDeps["sessions"]>, "verify").mockRejectedValueOnce(new Error("keys unavailable"));
    expect(await sessionCookieStale(value, deps)).toBe(false);
  });
});
