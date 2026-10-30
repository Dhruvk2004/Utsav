// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deleteAccount } from "@/lib/server/handlers/account";
import { health } from "@/lib/server/handlers/health";
import { getProfile, putProfile } from "@/lib/server/handlers/profile";
import { createSession, deleteSession, RECENT_SIGN_IN_S } from "@/lib/server/handlers/session";
import { EventRepo } from "@/lib/server/repos/events";
import { UserRepo, userPath } from "@/lib/server/repos/users";
import { wedding } from "../../domainFixtures";
import { apiRequest, bodyOf, fakeProbe, NOW_S, sessionCookie, testDeps } from "../../helpers/server";

const signIn = (idToken: string, init: Parameters<typeof apiRequest>[2] = {}) =>
  apiRequest("POST", "/api/session", { cookie: null, body: { idToken }, ...init });

describe("POST /api/session", () => {
  it("exchanges a fresh ID token for the session cookie and creates the profile once", async () => {
    const deps = testDeps();
    const response = await createSession(signIn(`id:u1:${NOW_S}`), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ onboarded: false });
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(`^__session=session%3Au1%3A${NOW_S}; Path=/; Max-Age=432000; HttpOnly; SameSite=Lax; Secure$`),
    );
    expect(await new UserRepo(deps.db).get("u1")).toMatchObject({ displayName: "User u1", email: "u1@example.com" });

    await new UserRepo(deps.db).savePatch("u1", { displayName: "", photoURL: null, email: "" }, { markOnboarded: true }, deps.clock());
    expect(await bodyOf(await createSession(signIn(`id:u1:${NOW_S}`), deps))).toEqual({ onboarded: true });
  });

  it("refuses an invalid token, a stale sign-in, another origin and a bad body", async () => {
    const deps = testDeps();
    expect((await createSession(signIn("forged"), deps)).status).toBe(401);
    expect((await createSession(signIn(`id:u1:${NOW_S - RECENT_SIGN_IN_S - 1}`), deps)).status).toBe(401);
    expect((await createSession(signIn(`id:u1:${NOW_S}`, { origin: "https://evil.example" }), deps)).status).toBe(403);
    expect((await createSession(apiRequest("POST", "/api/session", { cookie: null, body: { token: "x" } }), deps)).status).toBe(400);
  });

  it("is 503 without Firebase and rate limited per IP (10 a minute)", async () => {
    expect((await createSession(signIn("x"), { ...testDeps(), auth: null })).status).toBe(503);
    const deps = testDeps();
    const fromIp = () => signIn("forged", { headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4" } });
    for (let i = 0; i < 10; i++) expect((await createSession(fromIp(), deps)).status).toBe(401);
    expect((await createSession(fromIp(), deps)).status).toBe(429);
  });
});

describe("DELETE /api/session", () => {
  it("revokes refresh tokens, so a stolen cookie can no longer write, and clears the cookie", async () => {
    const deps = testDeps();
    const response = await deleteSession(apiRequest("DELETE", "/api/session"), deps);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(deps.auth.validAfter.has("u1")).toBe(true);
    expect((await putProfile(apiRequest("PUT", "/api/profile", { body: { homeCity: "Pune" } }), deps)).status).toBe(401);
  });

  it("clears the cookie even without a valid session, and checks the origin", async () => {
    const deps = testDeps();
    expect((await deleteSession(apiRequest("DELETE", "/api/session", { cookie: null }), deps)).status).toBe(204);
    expect(
      (await deleteSession(apiRequest("DELETE", "/api/session", { cookie: null }), { ...deps, sessions: null, auth: null })).status,
    ).toBe(204);
    expect((await deleteSession(apiRequest("DELETE", "/api/session", { origin: "https://evil.example" }), deps)).status).toBe(403);
  });
});

describe("/api/profile", () => {
  it("GET returns the profile that sign-in created, and never creates one (SEC-03)", async () => {
    const deps = testDeps();
    const missing = await getProfile(apiRequest("GET", "/api/profile"), deps);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("set-cookie")).toMatch(/^__session=;.*Max-Age=0/);
    expect(deps.db.docs.has(userPath("u1"))).toBe(false);
    expect(
      (await createSession(apiRequest("POST", "/api/session", { body: { idToken: `id:u1:${NOW_S}` }, cookie: null }), deps)).status,
    ).toBe(200);
    const response = await getProfile(apiRequest("GET", "/api/profile"), deps);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { profile } = (await response.json()) as { profile: Record<string, unknown> };
    expect(profile).toMatchObject({ displayName: "User u1", detailLevel: "everything" });
    expect(profile).not.toHaveProperty("createdAt");
  });

  it("PUT merges a validated patch and never accepts unknown fields", async () => {
    const deps = testDeps();
    const saved = await putProfile(apiRequest("PUT", "/api/profile", { body: { homeCity: "Pune", markOnboarded: true } }), deps);
    expect(await bodyOf(saved)).toMatchObject({ profile: { homeCity: "Pune", onboardedAt: "2026-10-28T06:00:00.000Z" } });
    expect((await putProfile(apiRequest("PUT", "/api/profile", { body: { onboardedAt: null } }), deps)).status).toBe(400);
    expect((await getProfile(apiRequest("GET", "/api/profile", { cookie: null }), deps)).status).toBe(401);
    expect(
      (await putProfile(apiRequest("PUT", "/api/profile", { cookie: sessionCookie("u2"), origin: null, body: {} }), deps)).status,
    ).toBe(403);
  });
});

describe("DELETE /api/account", () => {
  it("deletes every owned event, the profile and the auth user, then clears the cookie", async () => {
    const deps = testDeps();
    const events = new EventRepo(deps.db);
    await events.create({ ...wedding(), ownerUid: "u1" }, null);
    const kept = await events.create({ ...wedding(), ownerUid: "u2" }, null);
    await new UserRepo(deps.db).ensure("u1", { displayName: "A", photoURL: null, email: "" }, "2026-10-28", "2026-10-28T06:00:00.000Z");
    expect((await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "nope" } }), deps)).status).toBe(400);
    const response = await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" } }), deps);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(deps.db.docs.has(userPath("u1"))).toBe(false);
    expect(await events.ownedIds("u1")).toEqual([]);
    expect(await events.ownedIds("u2")).toEqual([kept]);
    expect(deps.auth.deleted.has("u1")).toBe(true);
    expect(deps.logs).toContain("account_deleted");
  });

  it("still succeeds when the auth user is already gone (a retried request)", async () => {
    const deps = testDeps();
    deps.auth.deleteUser = () => Promise.reject(new Error("auth/user-not-found"));
    expect((await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" } }), deps)).status).toBe(204);
  });
});

describe("GET /api/health", () => {
  it("reports Firestore and model reachability, cached for 60 s, with no secrets", async () => {
    const deps = testDeps({ probe: fakeProbe(true) });
    expect(await bodyOf(await health(deps))).toEqual({
      status: "ok",
      firestore: "ok",
      model: { id: "gemini-test", location: "global", reachable: true },
    });
    deps.db.get = async () => {
      throw new Error("down");
    };
    expect(await bodyOf(await health(deps))).toMatchObject({ firestore: "ok" });
  });

  it("says when Firestore is not configured or not answering", async () => {
    expect(await bodyOf(await health({ ...testDeps({ probe: fakeProbe(false) }), db: null }))).toMatchObject({
      firestore: "not_configured",
      model: { reachable: false },
    });
    const deps = testDeps();
    deps.db.get = async () => {
      throw new Error("down");
    };
    expect(await bodyOf(await health(deps))).toMatchObject({ firestore: "error" });
  });
});
