// @vitest-environment node
import { describe, expect, it } from "vitest";
import { APP_CSP_SOURCES, APP_PREFIXES, appCsp, firebaseHostOf, PUBLIC_CSP_SOURCE, publicCsp } from "@/lib/server/csp";
import { eventCalendar } from "@/lib/server/handlers/calendar";
import { EventRepo } from "@/lib/server/repos/events";
import { wedding } from "../../domainFixtures";
import { apiRequest, params, sessionCookie, testDeps } from "../../helpers/server";

describe("GET /api/events/[id]/calendar.ics", () => {
  it("downloads the owner's event as a private calendar file", async () => {
    const deps = testDeps();
    const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    const response = await eventCalendar(apiRequest("GET", `/api/events/${id}/calendar.ics`, { origin: null }), deps, params({ id }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename=".+\.ics"$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const text = await response.text();
    expect(text).toMatch(/^BEGIN:VCALENDAR/);
    expect(text).toContain("SUMMARY:");
  });

  it("is a 404 for someone else's event and a 401 without a session", async () => {
    const deps = testDeps();
    const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    expect(
      (await eventCalendar(apiRequest("GET", `/api/events/${id}/calendar.ics`, { cookie: sessionCookie("u2") }), deps, params({ id })))
        .status,
    ).toBe(404);
    expect((await eventCalendar(apiRequest("GET", `/api/events/${id}/calendar.ics`, { cookie: null }), deps, params({ id }))).status).toBe(
      401,
    );
  });
});

/** Directives as a map, so each can be checked on its own. */
const directives = (policy: string) => new Map(policy.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)] as const));

describe("Content Security Policy split (spec 9.1)", () => {
  it("keeps public pages same-origin only, with no frames and no eval in production", () => {
    const policy = directives(publicCsp({ dev: false }));
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    expect(policy.get("frame-src")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
  });

  it("allows eval only in development", () => {
    expect(directives(publicCsp({ dev: true })).get("script-src")).toContain("'unsafe-eval'");
    expect(directives(appCsp({ dev: true, firebaseHost: "" })).get("script-src")).toContain("'unsafe-eval'");
    expect(appCsp({ dev: false, firebaseHost: "" })).not.toContain("unsafe-eval");
  });

  it("adds exactly what Google sign-in needs on app pages, framing the Firebase host when configured", () => {
    const policy = directives(appCsp({ dev: false, firebaseHost: "https://utsav-test.firebaseapp.com" }));
    expect(policy.get("script-src")).toContain("https://apis.google.com");
    expect(policy.get("connect-src")).toEqual(
      expect.arrayContaining(["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]),
    );
    expect(policy.get("img-src")).toContain("https://lh3.googleusercontent.com");
    expect(policy.get("frame-src")).toEqual(["'self'", "https://accounts.google.com", "https://utsav-test.firebaseapp.com"]);
    expect(directives(appCsp({ dev: false, firebaseHost: "" })).get("frame-src")).toEqual(["'self'", "https://accounts.google.com"]);
  });

  it("derives the Firebase host from the project id", () => {
    expect(firebaseHostOf(" utsav-test ")).toBe("https://utsav-test.firebaseapp.com");
    expect(firebaseHostOf("")).toBe("");
    expect(firebaseHostOf(undefined)).toBe("");
  });

  it("routes each app prefix to the app policy and everything else, except /__/, to the public one", () => {
    expect(APP_CSP_SOURCES).toEqual([...APP_PREFIXES.map((p) => `/${p}/:path*`), "/signin", "/onboarding"]);
    const publicPattern = new RegExp(`^/${PUBLIC_CSP_SOURCE.slice("/:path".length)}$`);
    for (const path of ["/", "/demo", "/demo/wedding", "/privacy", "/api/demo/wedding/ai/instruct", "/sample"])
      expect(publicPattern.test(path)).toBe(true);
    for (const path of ["/signin", "/onboarding", "/dashboard", "/events/e1", "/settings", "/s/abc", "/__/auth/handler"])
      expect(publicPattern.test(path)).toBe(false);
  });
});
