// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Proposal } from "@/lib/domain/model/records";
import { decideProposal } from "@/lib/server/handlers/decide";
import { deleteEvent } from "@/lib/server/handlers/event";
import { createProposal, listWaiting } from "@/lib/server/handlers/proposals";
import { revokeShare, shareEvent } from "@/lib/server/handlers/share";
import { sharedPlanFor } from "@/lib/server/loaders/share";
import { EventRepo, privateSharePath, sharePath } from "@/lib/server/repos/events";
import { hashShareToken } from "@/lib/server/shareTokens";
import { DECOR_CUT } from "../../contracts/planStoreContract";
import { wedding } from "../../domainFixtures";
import { apiRequest, bodyOf, params, sessionCookie, testDeps, type TestDeps } from "../../helpers/server";

const VERSION = wedding().version;

async function seeded(deps: TestDeps) {
  return new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
}

async function proposed(deps: TestDeps, id: string, items: unknown[] = [{ op: DECOR_CUT }]): Promise<Proposal & { id: string }> {
  const response = await createProposal(
    apiRequest("POST", `/api/events/${id}/proposals`, { body: { touchpoint: "add_to_plan", baseVersion: VERSION, items } }),
    deps,
    params({ id }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { proposal: Proposal & { id: string } }).proposal;
}

const decide = (deps: TestDeps, id: string, pid: string, body: unknown) =>
  decideProposal(apiRequest("POST", `/api/events/${id}/proposals/${pid}/decide`, { body }), deps, params({ id, pid }));

describe("POST /api/events/[id]/proposals", () => {
  it("stores a code proposal, dry-run on the server, and counts it as pending", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const proposal = await proposed(deps, id, [
      { op: DECOR_CUT, rationale: "Trim decor" },
      { id: "gone", op: { type: "remove_task", taskId: "nope" } },
    ]);
    expect(proposal).toMatchObject({
      origin: "code",
      baseVersion: VERSION,
      items: [
        { id: "item-1", status: "pending", rationale: "Trim decor" },
        { id: "gone", status: "invalid" },
      ],
    });
    expect((await new EventRepo(deps.db).get(id))?.stats.pending).toEqual({ count: 1, expireAt: proposal.expireAt });
  });

  it("never takes the origin from the client, and refuses non-proposable ops and bad dependencies", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const post = (body: unknown) => createProposal(apiRequest("POST", `/api/events/${id}/proposals`, { body }), deps, params({ id }));
    expect((await post({ touchpoint: "add_to_plan", origin: "ai", baseVersion: VERSION, items: [{ op: DECOR_CUT }] })).status).toBe(400);
    expect(
      (await post({ touchpoint: "add_to_plan", baseVersion: VERSION, items: [{ op: { type: "set_summary", text: "x" } }] })).status,
    ).toBe(400);
    expect(
      (
        await post({
          touchpoint: "add_to_plan",
          baseVersion: VERSION,
          items: [{ op: DECOR_CUT, dependsOn: ["item-2"] }, { op: DECOR_CUT }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          touchpoint: "add_to_plan",
          baseVersion: VERSION,
          items: [
            { id: "a", op: DECOR_CUT },
            { id: "a", op: DECOR_CUT },
          ],
        })
      ).status,
    ).toBe(400);
  });

  it("is a 409 on a stale version and a 404 for someone else's event", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const stale = await createProposal(
      apiRequest("POST", `/api/events/${id}/proposals`, {
        body: { touchpoint: "reset", baseVersion: 0, items: [{ op: { type: "reset_section", section: "budget" } }] },
      }),
      deps,
      params({ id }),
    );
    expect(stale.status).toBe(409);
    const other = await createProposal(
      apiRequest("POST", `/api/events/${id}/proposals`, {
        cookie: sessionCookie("u2"),
        body: { touchpoint: "reset", baseVersion: VERSION, items: [{ op: DECOR_CUT }] },
      }),
      deps,
      params({ id }),
    );
    expect(other.status).toBe(404);
  });
});

describe("GET /api/events/[id]/proposals (CO-02, MQW-02, BP-03 regression)", () => {
  const list = (deps: TestDeps, id: string, cookie?: string) =>
    listWaiting(apiRequest("GET", `/api/events/${id}/proposals`, { cookie }), deps, params({ id }));

  it("lists the unexpired proposals that still have undecided items, oldest first, for the owner only", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const first = await proposed(deps, id);
    const second = await proposed(deps, id, [
      { op: { type: "add_task", title: "Book a dhol player", category: "Entertainment", daysBefore: 30 } },
    ]);
    const decided = await proposed(deps, id, [
      { op: { type: "add_task", title: "Confirm the pandit", category: "Rituals", daysBefore: 20 } },
    ]);
    expect(
      (await decide(deps, id, decided.id, { baseVersion: VERSION, decisions: [{ itemId: "item-1", action: "decline" }] })).status,
    ).toBe(200);
    // An expired proposal no longer counts as waiting.
    const expiredPath = [...deps.db.docs.keys()].find((path) => path.endsWith(`/${first.id}`))!;
    deps.db.docs.set(expiredPath, { ...(deps.db.docs.get(expiredPath) as object), expireAt: "2020-01-01T00:00:00.000Z" });

    const response = await list(deps, id);
    expect(response.status).toBe(200);
    const { proposals } = (await response.json()) as { proposals: (Proposal & { id: string })[] };
    expect(proposals.map((p) => p.id)).toEqual([second.id]);
    expect(proposals[0].items[0]).toMatchObject({ status: "pending", summary: expect.stringContaining("Book a dhol player") });

    expect((await list(deps, id, sessionCookie("u2"))).status).toBe(404);
    expect((await list(deps, "missing")).status).toBe(404);
    expect((await list(deps, id, "")).status).toBe(401);
  });
});

describe("POST /api/events/[id]/proposals/[pid]/decide", () => {
  it("applies an accepted item as a new version with history, and recounts pending", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const { id: pid } = await proposed(deps, id);
    const response = await decide(deps, id, pid, { baseVersion: VERSION, decisions: [{ itemId: "item-1", action: "accept" }] });
    const body = (await response.json()) as { event: EventDoc; proposal: Proposal; historyId: string; results: unknown[] };
    expect(body.event.version).toBe(VERSION + 1);
    expect(body.event.stats.pending.count).toBe(0);
    expect(body.proposal).toMatchObject({ id: pid, items: [{ status: "accepted" }] });
    expect(body.historyId).toEqual(expect.any(String));
    expect(body.results).toEqual([{ itemId: "item-1", ok: true, status: "accepted" }]);
  });

  it("keeps the version on decline and returns no history id", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const { id: pid } = await proposed(deps, id);
    const body = await bodyOf(await decide(deps, id, pid, { baseVersion: VERSION, decisions: [{ itemId: "item-1", action: "decline" }] }));
    expect(body).toMatchObject({ historyId: null, event: { version: VERSION } });
  });

  it("is a 409 on a stale version, 410 once expired, 404 for an unknown proposal", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const { id: pid } = await proposed(deps, id);
    expect((await decide(deps, id, pid, { baseVersion: 0, decisions: [{ itemId: "item-1", action: "accept" }] })).status).toBe(409);
    expect((await decide(deps, id, "nope", { baseVersion: VERSION, decisions: [{ itemId: "item-1", action: "accept" }] })).status).toBe(
      404,
    );
    const other = await decideProposal(
      apiRequest("POST", `/api/events/${id}/proposals/${pid}/decide`, {
        cookie: sessionCookie("u2"),
        body: { baseVersion: VERSION, decisions: [{ itemId: "item-1", action: "accept" }] },
      }),
      deps,
      params({ id, pid }),
    );
    expect(other.status).toBe(404);
    const path = `events/${id}/proposals/${pid}`;
    deps.db.docs.set(path, { ...deps.db.docs.get(path), expireAt: "2026-10-28T05:00:00.000Z" });
    expect((await decide(deps, id, pid, { baseVersion: VERSION, decisions: [{ itemId: "item-1", action: "accept" }] })).status).toBe(410);
  });
});

describe("share links", () => {
  const share = (deps: TestDeps, id: string, body = { showAmounts: true, showNotes: false }) =>
    shareEvent(apiRequest("POST", `/api/events/${id}/share`, { body }), deps, params({ id }));
  const tokenOf = (url: string) => url.split("/s/")[1];

  it("creates a 43-character token stored only by hash, and reuses it when options change", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const { url } = (await bodyOf(await share(deps, id))) as { url: string };
    expect(url).toMatch(/^https:\/\/utsav\.test\/s\/[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(url);
    expect(deps.db.docs.get(sharePath(hashShareToken(token)))).toMatchObject({
      eventId: id,
      ownerUid: "u1",
      showAmounts: true,
      revokedAt: null,
    });
    expect(JSON.stringify(deps.db.docs.get(sharePath(hashShareToken(token))))).not.toContain(token);
    expect((await new EventRepo(deps.db).get(id))?.share).toEqual({
      active: true,
      tokenHash: hashShareToken(token),
      showAmounts: true,
      showNotes: false,
    });

    const again = (await bodyOf(await share(deps, id, { showAmounts: false, showNotes: true }))) as { url: string };
    expect(again.url).toBe(url);
    expect(deps.db.docs.get(sharePath(hashShareToken(token)))).toMatchObject({ showAmounts: false, showNotes: true });
  });

  it("serves the read-only projection by token, then 404s after a soft revoke", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const token = tokenOf(((await bodyOf(await share(deps, id))) as { url: string }).url);
    const found = await sharedPlanFor(token, "1.2.3.4", deps);
    expect(found.kind).toBe("found");
    if (found.kind === "found") expect(found.view.budgetTotal).toBe("₹25,00,000");

    expect((await revokeShare(apiRequest("DELETE", `/api/events/${id}/share`), deps, params({ id }))).status).toBe(204);
    expect(deps.db.docs.get(sharePath(hashShareToken(token)))).toMatchObject({ revokedAt: "2026-10-28T06:00:00.000Z" });
    expect(deps.db.docs.has(privateSharePath(id))).toBe(false);
    expect((await new EventRepo(deps.db).get(id))?.share.active).toBe(false);
    expect(await sharedPlanFor(token, "1.2.3.4", deps)).toEqual({ kind: "not_found" });

    const fresh = tokenOf(((await bodyOf(await share(deps, id))) as { url: string }).url);
    expect(fresh).not.toBe(token);
    expect((await revokeShare(apiRequest("DELETE", `/api/events/${id}/share`), deps, params({ id }))).status).toBe(204);
    expect((await revokeShare(apiRequest("DELETE", `/api/events/${id}/share`), deps, params({ id }))).status).toBe(204);
  });

  it("is a 404 without a lookup for malformed or unknown tokens, a mismatched owner, or no database", async () => {
    const deps = testDeps();
    expect(await sharedPlanFor("demo", "ip", deps)).toEqual({ kind: "not_found" });
    expect(await sharedPlanFor("a".repeat(43), "ip", deps)).toEqual({ kind: "not_found" });
    expect(await sharedPlanFor("a".repeat(43), "ip", { ...deps, db: null })).toEqual({ kind: "not_found" });
    const id = await seeded(deps);
    const token = tokenOf(((await bodyOf(await share(deps, id))) as { url: string }).url);
    deps.db.docs.set(sharePath(hashShareToken(token)), { ...deps.db.docs.get(sharePath(hashShareToken(token))), ownerUid: "u2" });
    expect(await sharedPlanFor(token, "ip", deps)).toEqual({ kind: "not_found" });
  });

  it("caches the projection for 60 s and rate limits per IP", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const token = tokenOf(((await bodyOf(await share(deps, id))) as { url: string }).url);
    await sharedPlanFor(token, "ip", deps);
    await deps.db.deleteTree(`events/${id}`);
    expect((await sharedPlanFor(token, "ip", deps)).kind).toBe("found");
    for (let i = 0; i < 28; i++) await sharedPlanFor(token, "ip", deps);
    expect(await sharedPlanFor(token, "ip", deps)).toEqual({ kind: "rate_limited" });
  });

  it("drops the cached page when the event is deleted, and 404s for someone else's event", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const token = tokenOf(((await bodyOf(await share(deps, id))) as { url: string }).url);
    await sharedPlanFor(token, "ip", deps);
    await deleteEvent(
      apiRequest("DELETE", `/api/events/${id}`, { body: { confirmTitle: wedding().details.title || "Wedding" } }),
      deps,
      params({ id }),
    );
    expect(deps.caches.shares.get(hashShareToken(token))).toBeUndefined();
    expect((await share({ ...deps }, "missing")).status).toBe(404);
    expect((await revokeShare(apiRequest("DELETE", "/api/events/missing/share"), deps, params({ id: "missing" }))).status).toBe(404);
  });
});
