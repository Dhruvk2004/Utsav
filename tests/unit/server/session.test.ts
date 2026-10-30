// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearedSessionCookieHeader, readCookie, secureCookies, sessionCookieHeader, SESSION_TTL_MS } from "@/lib/server/auth/cookies";
import { authorize } from "@/lib/server/auth/guard";
import { sessionFromClaims, SessionVerifier } from "@/lib/server/auth/session";
import { apiRequest, FakeAuth, NOW, NOW_S, ORIGIN, sessionCookie, testDeps } from "../../helpers/server";

describe("session cookie", () => {
  it("is __session, httpOnly, SameSite=Lax, five days, Secure on https", () => {
    expect(sessionCookieHeader("abc", true)).toBe(
      `__session=abc; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(sessionCookieHeader("abc", false)).not.toContain("Secure");
    expect(clearedSessionCookieHeader(true)).toMatch(/^__session=; Path=\/; Max-Age=0/);
  });

  it("is Secure unless the app origin is plain http", () => {
    expect(secureCookies("https://utsav.app")).toBe(true);
    expect(secureCookies(null)).toBe(true);
    expect(secureCookies("http://localhost:3000")).toBe(false);
  });

  it("reads one cookie from a Cookie header", () => {
    expect(readCookie("a=1; __session=x%3Ay; b", "__session")).toBe("x:y");
    expect(readCookie("a=1", "__session")).toBeNull();
    expect(readCookie(null, "__session")).toBeNull();
  });
});

describe("SessionVerifier (spec 9.1, R2-08)", () => {
  const cookie = `session:u1:${NOW_S}`;

  it("verifies reads locally and never calls getUser", async () => {
    const auth = new FakeAuth();
    const verifier = new SessionVerifier(auth);
    expect(await verifier.verify(cookie, "read")).toEqual({
      uid: "u1",
      email: "u1@example.com",
      name: "User u1",
      picture: "https://lh3.googleusercontent.com/a",
    });
    expect(await verifier.verify(cookie, "read")).not.toBeNull();
    expect(auth.verifyCalls).toEqual([false, false]);
    expect(auth.getUserCalls).toBe(0);
  });

  it("checks revocation for writes once per uid per 60 s", async () => {
    const auth = new FakeAuth();
    let now = Date.parse(NOW);
    const verifier = new SessionVerifier(auth, () => now);
    await verifier.verify(cookie, "write");
    await verifier.verify(cookie, "write");
    expect(auth.getUserCalls).toBe(1);
    now += 60_000;
    await verifier.verify(cookie, "write");
    expect(auth.getUserCalls).toBe(2);
    expect(auth.verifyCalls.every((checkRevoked) => !checkRevoked)).toBe(true);
  });

  it("rejects a revoked session for writes but still renders reads until it expires", async () => {
    const auth = new FakeAuth();
    const verifier = new SessionVerifier(auth);
    await auth.revokeRefreshTokens("u1");
    expect(await verifier.verify(cookie, "write")).toBeNull();
    expect(await verifier.verify(cookie, "read")).not.toBeNull();
  });

  it("re-checks after forget(uid), and treats a deleted account as revoked", async () => {
    const auth = new FakeAuth();
    const verifier = new SessionVerifier(auth);
    expect(await verifier.verify(cookie, "write")).not.toBeNull();
    auth.deleted.add("u1");
    expect(await verifier.verify(cookie, "write")).not.toBeNull();
    verifier.forget("u1");
    expect(await verifier.verify(cookie, "write")).toBeNull();
  });

  it("fills blanks for claims Google did not send", () => {
    expect(sessionFromClaims({ uid: "u9", auth_time: 1 })).toEqual({ uid: "u9", email: "", name: "", picture: null });
  });

  it("returns null for a missing or invalid cookie", async () => {
    const verifier = new SessionVerifier(new FakeAuth());
    expect(await verifier.verify(null, "read")).toBeNull();
    expect(await verifier.verify("forged", "read")).toBeNull();
  });
});

describe("authorize", () => {
  it("answers 503 when Firebase is not configured", async () => {
    const deps = { ...testDeps(), db: null };
    const result = await authorize(apiRequest("GET", "/api/profile"), deps, "read");
    expect(!result.ok && result.response.status).toBe(503);
  });

  it("rejects writes from another origin, or with no Origin header (CSRF)", async () => {
    const deps = testDeps();
    for (const origin of ["https://evil.example", null]) {
      const result = await authorize(apiRequest("PUT", "/api/profile", { origin }), deps, "write");
      expect(!result.ok && result.response.status).toBe(403);
    }
  });

  it("uses the request's own origin when APP_ORIGIN is not set", async () => {
    const deps = { ...testDeps(), appOrigin: null };
    expect((await authorize(apiRequest("PUT", "/api/profile", { origin: ORIGIN }), deps, "write")).ok).toBe(true);
  });

  it("answers 401 without a session, and clears a cookie that no longer verifies", async () => {
    const deps = testDeps();
    const none = await authorize(apiRequest("GET", "/api/profile", { cookie: null }), deps, "read");
    expect(!none.ok && none.response.status).toBe(401);
    expect(!none.ok && none.response.headers.get("set-cookie")).toBeNull();

    await deps.auth.revokeRefreshTokens("u1");
    const revoked = await authorize(apiRequest("PUT", "/api/profile"), deps, "write");
    expect(!revoked.ok && revoked.response.status).toBe(401);
    expect(!revoked.ok && revoked.response.headers.get("set-cookie")).toMatch(/^__session=;.*Max-Age=0/);
  });

  it("rate limits writes per user (60 a minute)", async () => {
    const deps = testDeps();
    for (let i = 0; i < 60; i++) expect((await authorize(apiRequest("PUT", "/api/profile"), deps, "write")).ok).toBe(true);
    const limited = await authorize(apiRequest("PUT", "/api/profile"), deps, "write");
    expect(!limited.ok && limited.response.status).toBe(429);
    expect((await authorize(apiRequest("PUT", "/api/profile", { cookie: sessionCookie("u2") }), deps, "write")).ok).toBe(true);
  });
});
