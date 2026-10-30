// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readCookie, SESSION_COOKIE } from "@/lib/server/auth/cookies";
import { authorize } from "@/lib/server/auth/guard";
import { deleteAccount } from "@/lib/server/handlers/account";
import { patchEvent } from "@/lib/server/handlers/event";
import { getProfile } from "@/lib/server/handlers/profile";
import { createSession, deleteSession, RECENT_SIGN_IN_S } from "@/lib/server/handlers/session";
import { revokeShare, shareEvent } from "@/lib/server/handlers/share";
import { EventRepo, privateSharePath, sharePath } from "@/lib/server/repos/events";
import { userPath } from "@/lib/server/repos/users";
import { hashShareToken, SHARE_TOKEN_BYTES } from "@/lib/server/shareTokens";
import { wedding } from "../domainFixtures";
import { apiRequest, NOW_S, params, sessionCookie, testDeps, type TestDeps } from "../helpers/server";

vi.mock("next/cache", () => ({ io: async () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
const { sharedPlanFor } = await import("@/lib/server/loaders/share");
const { viewerFor } = await import("@/lib/server/loaders/viewer");

/**
 * Penetration-test regressions (docs/qa-report.md, "Penetration test"): the session cookie, sign-out
 * and account deletion, and share links (entropy, storage, projection, revocation). Each SEC-xx test
 * was an `it.fails` marker for a confirmed finding; the findings are fixed, so they are ordinary tests now.
 */

const A = "owner-a";

async function seeded(): Promise<{ deps: TestDeps; id: string }> {
  const deps = testDeps();
  const base = wedding();
  const event = {
    ...base,
    ownerUid: A,
    details: { ...base.details, title: "Ananya Secretname wedding" },
    honorees: [
      { id: "h1", role: "bride" as const, name: "Ananya Secretname", age: 28, gender: null, interests: [], notes: "Allergic to lilies" },
    ],
    vendors: base.vendors.map((vendor, i) =>
      i === 0 ? { ...vendor, label: "Lotus Secret Caterers", contact: "+91 98765 43210", notes: "Private vendor note" } : vendor,
    ),
  };
  const id = await new EventRepo(deps.db).create(event, null);
  return { deps, id };
}

const share = (deps: TestDeps, id: string, body = { showAmounts: false, showNotes: false }) =>
  shareEvent(apiRequest("POST", `/api/events/${id}/share`, { body, cookie: sessionCookie(A) }), deps, params({ id }));
const tokenOf = async (response: Response) => ((await response.json()) as { url: string }).url.split("/s/")[1];

describe("the session cookie", () => {
  it("is httpOnly, SameSite=Lax, Secure on https, host-only, for five days", async () => {
    const deps = testDeps();
    const response = await createSession(apiRequest("POST", "/api/session", { body: { idToken: `id:${A}:${NOW_S}` }, cookie: null }), deps);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^__session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=432000");
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("is minted only from a sign-in less than five minutes old", async () => {
    const deps = testDeps();
    const stale = await createSession(
      apiRequest("POST", "/api/session", { body: { idToken: `id:${A}:${NOW_S - RECENT_SIGN_IN_S - 1}` }, cookie: null }),
      deps,
    );
    expect(stale.status).toBe(401);
    expect(stale.headers.get("set-cookie")).toBeNull();
  });

  it("stops working for writes as soon as the user signs out", async () => {
    const { deps, id } = await seeded();
    const cookie = sessionCookie(A);
    expect((await deleteSession(apiRequest("DELETE", "/api/session", { cookie }), deps)).status).toBe(204);
    const write = await patchEvent(
      apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion: 1, ops: [{ type: "set_summary", text: "x" }] }, cookie }),
      deps,
      params({ id }),
    );
    expect(write.status).toBe(401);
    expect(write.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("stops working for writes once the account is deleted", async () => {
    const { deps } = await seeded();
    const cookie = sessionCookie(A);
    expect((await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" }, cookie }), deps)).status).toBe(204);
    expect((await authorize(apiRequest("POST", "/api/events", { cookie }), deps, "write")).ok).toBe(false);
  });

  it("SEC-03: a cookie of a deleted account cannot re-create the profile through GET /api/profile", async () => {
    const { deps } = await seeded();
    const cookie = sessionCookie(A);
    await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" }, cookie }), deps);
    expect(deps.db.docs.has(userPath(A))).toBe(false);
    const response = await getProfile(apiRequest("GET", "/api/profile", { cookie }), deps);
    // The read path skips the revocation check (spec 9.1 trade-off), so the read itself must not write.
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(deps.db.docs.has(userPath(A))).toBe(false);
  });

  it("SEC-03: the pages treat a session without a profile as signed out", async () => {
    const { deps } = await seeded();
    const session = { uid: A, email: "", name: "", picture: null };
    await createSession(apiRequest("POST", "/api/session", { body: { idToken: `id:${A}:${NOW_S}` }, cookie: null }), deps);
    expect(await viewerFor(session, deps)).toBe("not_onboarded");
    await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" }, cookie: sessionCookie(A) }), deps);
    expect(await viewerFor(session, deps)).toBe("signed_out");
    expect(deps.db.docs.size).toBe(0);
  });

  it("SEC-05: a malformed cookie value is a 401, not an unhandled error", async () => {
    const deps = testDeps();
    const result = await authorize(apiRequest("GET", "/api/events", { cookie: "__session=%E0%A4%A" }), deps, "read");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("SEC-05: readCookie treats bad percent-encoding as no cookie and still decodes good values", () => {
    expect(readCookie("__session=%E0%A4%A", SESSION_COOKIE)).toBeNull();
    expect(readCookie("other=%; __session=%ZZ", SESSION_COOKIE)).toBeNull();
    expect(readCookie("other=%; __session=a%3Db", SESSION_COOKIE)).toBe("a=b");
  });
});

describe("share links", () => {
  it("use 32 random bytes as a 43-character base64url token, and store only its hash by name", async () => {
    const { deps, id } = await seeded();
    const sizes: number[] = [];
    const random = deps.randomBytes;
    deps.randomBytes = (size) => (sizes.push(size), random(size));
    const token = await tokenOf(await share(deps, id));
    expect(sizes).toEqual([SHARE_TOKEN_BYTES]);
    expect(SHARE_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(256);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deps.db.docs.has(sharePath(hashShareToken(token)))).toBe(true);
    // The raw token lives only in the server-only private doc, never in a doc named by it or in the event.
    const elsewhere = [...deps.db.docs.entries()]
      .filter(([path]) => path !== privateSharePath(id))
      .map(([path, data]) => path + JSON.stringify(data));
    expect(elsewhere.join("\n")).not.toContain(token);
  });

  it("project no title, names, notes, contacts, labels, ids or amounts unless asked", async () => {
    const { deps, id } = await seeded();
    const token = await tokenOf(await share(deps, id));
    const result = await sharedPlanFor(token, "1.2.3.4", deps);
    expect(result.kind).toBe("found");
    const text = JSON.stringify(result);
    for (const secret of ["Secretname", "Allergic", "Lotus Secret", "98765", "Private vendor note", A, id, "₹"])
      expect(text).not.toContain(secret);
  });

  it("show vendor notes only when the owner opts in, and never contacts or labels", async () => {
    const { deps, id } = await seeded();
    const token = await tokenOf(await share(deps, id, { showAmounts: true, showNotes: true }));
    const text = JSON.stringify(await sharedPlanFor(token, "1.2.3.4", deps));
    expect(text).toContain("Private vendor note");
    expect(text).not.toContain("Lotus Secret");
    expect(text).not.toContain("+91 98765");
  });

  it("stop working at once when revoked, and a new link gets a new token", async () => {
    const { deps, id } = await seeded();
    const token = await tokenOf(await share(deps, id));
    expect((await sharedPlanFor(token, "1.2.3.4", deps)).kind).toBe("found");
    expect(
      (await revokeShare(apiRequest("DELETE", `/api/events/${id}/share`, { cookie: sessionCookie(A) }), deps, params({ id }))).status,
    ).toBe(204);
    expect((await sharedPlanFor(token, "1.2.3.4", deps)).kind).toBe("not_found");
    expect(deps.db.docs.has(privateSharePath(id))).toBe(false);
    const again = await tokenOf(await share(deps, id));
    expect(again).not.toBe(token);
  });

  it("refuse a malformed token without a database read, and rate limit per client", async () => {
    const { deps } = await seeded();
    const get = vi.spyOn(deps.db, "get");
    expect((await sharedPlanFor("short", "1.2.3.4", deps)).kind).toBe("not_found");
    expect(get).not.toHaveBeenCalled();
    const wellFormed = "A".repeat(43);
    const kinds = [];
    for (let i = 0; i < 31; i++) kinds.push((await sharedPlanFor(wellFormed, "9.9.9.9", deps)).kind);
    expect(kinds.at(-1)).toBe("rate_limited");
  });

  it("SEC-04: stop working at once when the owner deletes the account", async () => {
    const { deps, id } = await seeded();
    const token = await tokenOf(await share(deps, id));
    expect((await sharedPlanFor(token, "1.2.3.4", deps)).kind).toBe("found");
    await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" }, cookie: sessionCookie(A) }), deps);
    expect((await sharedPlanFor(token, "1.2.3.4", deps)).kind).toBe("not_found");
  });

  it("SEC-04: every shared event of the account stops at once, and another owner's link keeps working", async () => {
    const { deps, id } = await seeded();
    const second = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: A }, null);
    const other = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "owner-b" }, null);
    const tokens = [await tokenOf(await share(deps, id)), await tokenOf(await share(deps, second))];
    const otherToken = await tokenOf(
      await shareEvent(
        apiRequest("POST", `/api/events/${other}/share`, {
          body: { showAmounts: false, showNotes: false },
          cookie: sessionCookie("owner-b"),
        }),
        deps,
        params({ id: other }),
      ),
    );
    for (const token of [...tokens, otherToken]) expect((await sharedPlanFor(token, "1.2.3.4", deps)).kind).toBe("found");
    await deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" }, cookie: sessionCookie(A) }), deps);
    for (const token of tokens) expect((await sharedPlanFor(token, "1.2.3.4", deps)).kind).toBe("not_found");
    expect((await sharedPlanFor(otherToken, "1.2.3.4", deps)).kind).toBe("found");
  });
});
