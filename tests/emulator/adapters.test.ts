import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";
import { beforeAll, describe, expect, it } from "vitest";
import { Api } from "@/lib/data/api";
import { HttpPlanApi } from "@/lib/data/planApi";
import type { EventDoc } from "@/lib/domain/model/event";
import { ServerPlanStore } from "@/lib/plan/ServerPlanStore";
import { SessionVerifier } from "@/lib/server/auth/session";
import type { Db } from "@/lib/server/db/types";
import { adminServices } from "@/lib/server/firebase/admin";
import { sharedPlanFor } from "@/lib/server/loaders/share";
import { EventRepo, eventPath } from "@/lib/server/repos/events";
import { DECOR_CUT, proposalOf } from "../contracts/planStoreContract";
import { wedding } from "../domainFixtures";
import { inProcessFetch } from "../helpers/inProcessFetch";
import { apiRequest, bodyOf, createRequest, params, sessionCookie, testDeps } from "../helpers/server";
import { createEvent, listEvents } from "@/lib/server/handlers/events";
import { deleteEvent } from "@/lib/server/handlers/event";
import { revokeShare, shareEvent } from "@/lib/server/handlers/share";
import { defaultEventTitle } from "@/lib/domain/labels";

/**
 * The production adapters (`adminServices`: Admin SDK Auth and Firestore, over gRPC under the emulator, and
 * `firestoreDb`) against the emulators, under the real route handlers and client stores. The unit
 * suites run the same handlers on `MemoryDb`; this proves the in-memory double tells the truth.
 */

const PROJECT = "demo-utsav";
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:3480";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:3481";

let db: Db;
let services: ReturnType<typeof adminServices>;
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  services = adminServices(PROJECT);
  db = services.db;
});

/** Route-handler deps with the real Firestore adapter in place of `MemoryDb`. */
function firestoreDeps() {
  return { ...testDeps(), db };
}

async function seedEvent(uid = `u-${unique()}`): Promise<{ id: string; uid: string; plan: EventDoc }> {
  const plan = { ...wedding(), ownerUid: uid };
  const id = await new EventRepo(db).create(plan, null);
  return { id, uid, plan };
}

describe("firestoreDb (Admin SDK over REST)", () => {
  it("round-trips a document and stores TTL fields as Firestore Timestamps", async () => {
    const path = `scratch/${unique()}`;
    await db.transaction(async (tx) =>
      tx.set(path, { expireAt: "2026-10-30T06:00:00.000Z", nested: { at: "2026-10-28T06:00:00.000Z" }, n: 1 }),
    );
    const raw = (await getFirestore(getApps()[0]).doc(path).get()).data();
    expect(raw?.expireAt).toBeInstanceOf(Timestamp);
    expect(await db.get(path)).toEqual({ expireAt: "2026-10-30T06:00:00.000Z", nested: { at: "2026-10-28T06:00:00.000Z" }, n: 1 });
    expect(await db.get(`scratch/${unique()}`)).toBeNull();
  });

  it("queries with equality filters, ordering and a field projection like MemoryDb", async () => {
    const group = unique();
    for (const [name, rank] of [
      ["b", 2],
      ["a", 1],
      ["c", 3],
    ] as const) {
      await db.transaction(async (tx) => tx.set(`ranked/${group}-${name}`, { group, rank, deep: { keep: name, drop: "x" } }));
    }
    const rows = await db.query("ranked", {
      where: [{ field: "group", op: "==", value: group }],
      orderBy: { field: "rank", direction: "desc" },
      select: ["deep.keep"],
    });
    expect(rows.map((r) => r.data)).toEqual([{ deep: { keep: "c" } }, { deep: { keep: "b" } }, { deep: { keep: "a" } }]);
  });

  it("refuses a read after a write inside a transaction, and commits nothing when the body throws", async () => {
    const path = `scratch/${unique()}`;
    await expect(
      db.transaction(async (tx) => {
        tx.set(path, { a: 1 });
        await tx.get(path);
      }),
    ).rejects.toThrow(/reads/i);
    await expect(
      db.transaction(async (tx) => {
        tx.set(path, { a: 1 });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.get(path)).toBeNull();
  });

  it("drops undefined fields of objects, as optional fields left unset", async () => {
    const path = `scratch/${unique()}`;
    await db.transaction(async (tx) => tx.set(path, { a: 1, gone: undefined, nested: { gone: undefined, b: 2 } }));
    expect(await db.get(path)).toEqual({ a: 1, nested: { b: 2 } });
  });

  it("drops undefined fields of objects inside arrays too (QA-01 regression)", async () => {
    const path = `scratch/${unique()}`;
    await db.transaction(async (tx) => tx.set(path, { items: [{ id: "i1", reason: undefined }] }));
    expect(await db.get(path)).toEqual({ items: [{ id: "i1" }] });
  });

  it("deleteTree removes a document with its subcollections", async () => {
    const { id } = await seedEvent();
    await db.transaction(async (tx) => tx.set(`${eventPath(id)}/history/h1`, { a: 1 }));
    await db.deleteTree(eventPath(id));
    expect(await db.get(eventPath(id))).toBeNull();
    expect(await db.get(`${eventPath(id)}/history/h1`)).toBeNull();
  });

  it("serialises concurrent writes to one event: both land and the version counts both", async () => {
    const { id, plan } = await seedEvent();
    const store = (cookieUid: string) =>
      new ServerPlanStore(plan, new HttpPlanApi(id, new Api(inProcessFetch(firestoreDeps(), sessionCookie(cookieUid)))));
    const a = store(plan.ownerUid);
    const b = store(plan.ownerUid);
    const results = await Promise.all([
      a.applyManual([{ type: "set_summary", text: "A" }]),
      b.applyManual([{ type: "set_summary", text: "B" }]),
    ]);
    // Same base version: exactly one wins, the other gets the 409 and the winner's plan.
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const stored = (await new EventRepo(db).get(id)) as EventDoc;
    expect(stored.version).toBe(plan.version + 1);
    expect([a.getPlan().version, b.getPlan().version]).toEqual([stored.version, stored.version]);
  });
});

describe("route handlers and ServerPlanStore over Firestore", () => {
  it("creates a template event and lists it through the dashboard projection", async () => {
    const deps = firestoreDeps();
    const uid = `u-${unique()}`;
    const created = await createEvent(apiRequest("POST", "/api/events", { body: createRequest(), cookie: sessionCookie(uid) }), deps);
    expect(created.status).toBe(201);
    const { eventId, source } = (await bodyOf(created)) as { eventId: string; source: string };
    expect(source).toBe("template");
    const listed = (await bodyOf(await listEvents(apiRequest("GET", "/api/events", { cookie: sessionCookie(uid) }), deps))) as {
      events: { id: string; budgetTotal: number }[];
    };
    expect(listed.events).toEqual([expect.objectContaining({ id: eventId, budgetTotal: 2_500_000 })]);
    // Another user sees nothing.
    const other = (await bodyOf(await listEvents(apiRequest("GET", "/api/events", { cookie: sessionCookie(`u-${unique()}`) }), deps))) as {
      events: unknown[];
    };
    expect(other.events).toEqual([]);
  });

  it("edits, accepts and declines cards and undoes, all stored in Firestore", async () => {
    const { id, plan } = await seedEvent();
    const store = new ServerPlanStore(plan, new HttpPlanApi(id, new Api(inProcessFetch(firestoreDeps(), sessionCookie(plan.ownerUid)))));
    expect((await store.applyManual([DECOR_CUT])).ok).toBe(true);
    const decided = await store.decide(
      proposalOf([{ type: "add_task", title: "Book the dhol player", category: "Entertainment", daysBefore: 30 }, DECOR_CUT]),
      [
        { itemId: "i1", action: "accept" },
        { itemId: "i2", action: "decline" },
      ],
    );
    expect(decided.results, JSON.stringify(decided.results)).toMatchObject([{ ok: true }, { ok: true }]);
    const stored = (await new EventRepo(db).get(id)) as EventDoc;
    expect(stored.tasks.map((t) => t.title)).toContain("Book the dhol player");
    expect(stored.budget.lines.find((l) => l.id === "line-decor")?.amount).toBe(240_000);
    expect((await store.undo()).ok).toBe(true);
    expect(((await new EventRepo(db).get(id)) as EventDoc).tasks.map((t) => t.title)).not.toContain("Book the dhol player");
  });

  it("restores a declined card (QA-01 regression)", async () => {
    const { id, plan } = await seedEvent();
    const store = new ServerPlanStore(plan, new HttpPlanApi(id, new Api(inProcessFetch(firestoreDeps(), sessionCookie(plan.ownerUid)))));
    const declined = await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "decline" }]);
    const restored = await store.decide(declined.proposal, [{ itemId: "i1", action: "restore" }]);
    expect(restored.results[0]).toMatchObject({ ok: true, status: "pending" });
  });

  it("shares, serves the read-only projection, revokes and deletes the event with its share docs", async () => {
    const deps = firestoreDeps();
    const { id, uid, plan } = await seedEvent();
    const cookie = sessionCookie(uid);
    const shared = await shareEvent(
      apiRequest("POST", `/api/events/${id}/share`, { body: { showAmounts: false, showNotes: false }, cookie }),
      deps,
      params({ id }),
    );
    const { url } = (await bodyOf(shared)) as { url: string };
    const token = url.split("/s/")[1];
    const found = await sharedPlanFor(token, "198.51.100.1", deps);
    expect(found.kind).toBe("found");
    expect(JSON.stringify(found)).not.toContain("₹");

    expect((await revokeShare(apiRequest("DELETE", `/api/events/${id}/share`, { cookie }), deps, params({ id }))).status).toBe(204);
    expect((await sharedPlanFor(token, "198.51.100.1", deps)).kind).toBe("not_found");

    await shareEvent(
      apiRequest("POST", `/api/events/${id}/share`, { body: { showAmounts: true, showNotes: false }, cookie }),
      deps,
      params({ id }),
    );
    const title = plan.details.title || defaultEventTitle(plan.details);
    expect(
      (await deleteEvent(apiRequest("DELETE", `/api/events/${id}`, { body: { confirmTitle: title }, cookie }), deps, params({ id })))
        .status,
    ).toBe(204);
    expect(await db.get(eventPath(id))).toBeNull();
    expect(await db.query("shares", { where: [{ field: "eventId", op: "==", value: id }] })).toEqual([]);
  });
});

describe("SessionAuth (Admin SDK Auth against the Auth emulator)", () => {
  async function idTokenFor(uid: string): Promise<string> {
    const claims = JSON.stringify({ sub: uid, email: `${uid}@example.com`, email_verified: true, name: "Asha Verma" });
    const response = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(claims)}&providerId=google.com`,
        requestUri: "http://localhost",
        returnSecureToken: true,
      }),
    });
    return ((await response.json()) as { idToken: string }).idToken;
  }

  it("verifies a Google sign-in, mints a session cookie and checks revocation on writes", async () => {
    const { auth } = services;
    const idToken = await idTokenFor(`google-${unique()}`);
    const claims = await auth.verifyIdToken(idToken);
    expect(claims).toMatchObject({ email: expect.stringMatching(/@example\.com$/), name: "Asha Verma", auth_time: expect.any(Number) });
    const cookie = await auth.createSessionCookie(idToken, { expiresIn: 5 * 60 * 1000 });

    const verifier = new SessionVerifier(auth);
    expect(await verifier.verify(cookie, "read")).toMatchObject({ uid: claims.uid, name: "Asha Verma" });
    expect(await verifier.verify(cookie, "write")).toMatchObject({ uid: claims.uid });
    expect(await verifier.verify("not-a-cookie", "read")).toBeNull();

    // Sign-out revokes: the next write check (after the per-uid cache is dropped) refuses the cookie.
    await new Promise((r) => setTimeout(r, 1_100));
    await auth.revokeRefreshTokens(claims.uid);
    verifier.forget(claims.uid);
    expect(await verifier.verify(cookie, "write")).toBeNull();
    // In emulator mode the Admin SDK always checks revocation, so reads fail too here; that reads
    // skip the check in production is unit-tested with the fake Auth (tests/unit/server).
    expect(await verifier.verify(cookie, "read")).toBeNull();

    // A deleted account can no longer write.
    await auth.deleteUser(claims.uid);
    verifier.forget(claims.uid);
    expect(await verifier.verify(cookie, "write")).toBeNull();
  });
});
