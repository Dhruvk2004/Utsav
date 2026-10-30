// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Api, ApiRequestError } from "@/lib/data/api";
import { HttpAiClient } from "@/lib/data/httpAiClient";
import { HttpPlanApi } from "@/lib/data/planApi";
import { HttpWorkspaceRepository } from "@/lib/data/workspaces";
import type { EventDoc } from "@/lib/domain/model/event";
import { CONFLICT_MESSAGE, UNDO_STALE_MESSAGE } from "@/lib/plan/commands";
import { ServerPlanStore } from "@/lib/plan/ServerPlanStore";
import { EventRepo } from "@/lib/server/repos/events";
import { DECOR_CUT, planStoreContract, proposalOf } from "../../contracts/planStoreContract";
import { wedding } from "../../domainFixtures";
import { fakeModel } from "../../helpers/fakeModel";
import { inProcessFetch } from "../../helpers/inProcessFetch";
import { testDeps, type TestDeps } from "../../helpers/server";

const decor = (plan: EventDoc) => plan.budget.lines.find((line) => line.id === "line-decor")?.amount;

function serverStore(plan: EventDoc = { ...wedding(), ownerUid: "u1" }) {
  const deps = testDeps();
  const id = `ev-${Math.random().toString(36).slice(2)}`;
  deps.db.docs.set(`events/${id}`, structuredClone(plan));
  const api = new HttpPlanApi(id, new Api(inProcessFetch(deps)));
  return { deps, id, api, store: new ServerPlanStore(plan, api) };
}

/** Synchronous factory for the contract: the event is written straight into the in-memory database. */
planStoreContract("ServerPlanStore", () => serverStore().store);

describe("ServerPlanStore", () => {
  it("saves manual edits on the server and undoes this tab's own changes", async () => {
    const { store, deps, id } = serverStore();
    const result = await store.applyManual([DECOR_CUT]);
    expect(result).toMatchObject({ ok: true, results: [{ ok: true }] });
    expect(decor((await new EventRepo(deps.db).get(id)) as EventDoc)).toBe(240_000);
    expect((await store.undo()).ok).toBe(true);
    expect(decor(store.getPlan())).toBe(300_000);
  });

  it("reports a rejected edit with the server's reason and per-op results", async () => {
    const { store } = serverStore();
    const result = await store.applyManual([{ type: "remove_task", taskId: "nope" }]);
    expect(result).toMatchObject({ ok: false, results: [{ ok: false }], reason: expect.stringMatching(/Task/) });
  });

  it("swaps in the latest plan on a version conflict and drops stale undo entries", async () => {
    const { store, deps, id } = serverStore();
    await store.applyManual([DECOR_CUT]);
    const path = `events/${id}`;
    const stored = deps.db.docs.get(path) as EventDoc;
    deps.db.docs.set(path, { ...stored, version: stored.version + 5, summary: { text: "Changed elsewhere", origin: "user" } });
    const listener = vi.fn();
    store.subscribe(listener);
    const result = await store.applyManual([{ type: "set_summary", text: "Mine" }]);
    expect(result).toMatchObject({ ok: false, reason: CONFLICT_MESSAGE });
    expect(store.getPlan().summary.text).toBe("Changed elsewhere");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await store.undo()).toMatchObject({ ok: false, reason: "Nothing to undo" });

    const decided = await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
    expect(decided.results[0]).toMatchObject({ ok: true });
  });

  it("explains a refused undo and a network failure without throwing", async () => {
    const { store, deps, id } = serverStore();
    await store.applyManual([DECOR_CUT]);
    const path = `events/${id}`;
    deps.db.docs.set(path, { ...(deps.db.docs.get(path) as EventDoc), version: 99 });
    expect(await store.undo()).toMatchObject({ ok: false, reason: UNDO_STALE_MESSAGE });

    const offline = new HttpPlanApi("x", new Api(() => Promise.reject(new TypeError("Failed to fetch"))));
    const result = await new ServerPlanStore(wedding(), offline).applyManual([DECOR_CUT]);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Check your connection/) });
  });

  it("stores a browser-built proposal once, then decides on it by id", async () => {
    const { store, api } = serverStore();
    const create = vi.spyOn(api, "createProposal");
    const first = await store.decide(proposalOf([DECOR_CUT, DECOR_CUT]), [{ itemId: "i1", action: "decline" }]);
    expect(first.proposal).toMatchObject({ origin: "code", id: expect.any(String) });
    await store.decide(first.proposal, [{ itemId: "i2", action: "accept" }]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(decor(store.getPlan())).toBe(240_000);
  });

  it("marks review sections and starts an untouched AI plan over from the template", async () => {
    const review = { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" } as const;
    const { store } = serverStore({ ...wedding(), ownerUid: "u1", review, version: 1 });
    expect(store.canStartFromTemplate()).toBe(true);
    await store.markReviewed("budget", "reviewed");
    expect(store.getPlan().review?.budget).toBe("reviewed");
    expect(store.getPlan().version).toBe(1);
    // This plan has no creation entry, so the server refuses with a 404 and the plan is unchanged.
    expect(await store.startFromTemplate()).toMatchObject({ ok: false });
    await store.applyManual([DECOR_CUT]);
    expect(store.canStartFromTemplate()).toBe(false);

    const { store: plain } = serverStore();
    await plain.markReviewed("budget", "reviewed");
    expect(plain.getPlan().review).toBeNull();
  });
});

describe("ServerPlanStore undo failures (QA-17 regression)", () => {
  it("keeps the entry when the undo request fails (network or 5xx), so a retry reverts the change", async () => {
    const { store, api } = serverStore();
    await store.applyManual([DECOR_CUT]);
    expect(store.undoDepth()).toBe(1);
    const undo = vi.spyOn(api, "undo").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await store.undo()).toMatchObject({ ok: false, reason: expect.stringMatching(/Check your connection/) });
    expect(store.undoDepth()).toBe(1);
    expect(decor(store.getPlan())).toBe(240_000);

    undo.mockRejectedValueOnce(new ApiRequestError(500, "internal", "Something went wrong on our side.", {}));
    expect(await store.undo()).toMatchObject({ ok: false, reason: "Something went wrong on our side." });
    expect(store.undoDepth()).toBe(1);

    expect(await store.undo()).toMatchObject({ ok: true });
    expect(decor(store.getPlan())).toBe(300_000);
    expect(store.undoDepth()).toBe(0);
  });

  it("drops the entry when the server refuses the undo (the plan changed since)", async () => {
    const { store, deps, id } = serverStore();
    await store.applyManual([DECOR_CUT]);
    const path = `events/${id}`;
    deps.db.docs.set(path, { ...(deps.db.docs.get(path) as EventDoc), version: 99 });
    expect(await store.undo()).toMatchObject({ ok: false, reason: UNDO_STALE_MESSAGE });
    expect(store.undoDepth()).toBe(0);
    expect(await store.undo()).toMatchObject({ ok: false, reason: "Nothing to undo" });
  });

  it("clears the history on a version conflict, and says why a decision request failed", async () => {
    const { store, deps, id } = serverStore();
    await store.applyManual([DECOR_CUT]);
    const path = `events/${id}`;
    const stored = deps.db.docs.get(path) as EventDoc;
    deps.db.docs.set(path, { ...stored, version: stored.version + 5 });
    await store.applyManual([{ type: "set_summary", text: "Mine" }]);
    expect(store.undoDepth()).toBe(0);

    const offline = new ServerPlanStore(wedding(), new HttpPlanApi("x", new Api(() => Promise.reject(new TypeError("Failed to fetch")))));
    const decided = await offline.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
    expect(decided).toMatchObject({ reason: expect.stringMatching(/Check your connection/), results: [{ ok: false }] });
  });

  it("puts the template restore on the undo stack, so the review banner's Undo reverts it", async () => {
    const plan = {
      ...wedding(),
      ownerUid: "u1",
      review: { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" } as const,
      version: 1,
    };
    const { store, api } = serverStore(plan);
    vi.spyOn(api, "undo").mockResolvedValueOnce({ event: { ...plan, version: 2 }, historyId: "h-restore" });
    expect(await store.startFromTemplate()).toMatchObject({ ok: true });
    expect(store.undoDepth()).toBe(1);
    const undo = vi.mocked(api.undo).mockResolvedValueOnce({ event: { ...plan, version: 3 }, historyId: "h-undo" });
    expect(await store.undo()).toMatchObject({ ok: true });
    expect(undo).toHaveBeenLastCalledWith("h-restore");
    expect(store.undoDepth()).toBe(0);
  });
});

describe("ServerPlanStore runs one request at a time (QA-19 regression)", () => {
  const VENUE_CUT = { ...DECOR_CUT, lineId: "line-venue" } as const;

  it("two quick decisions both apply: the second waits and carries the version the first left", async () => {
    const { store, api, deps, id } = serverStore();
    const decide = vi.spyOn(api, "decide");
    const stored = await store.decide(proposalOf([DECOR_CUT, VENUE_CUT]), []);
    decide.mockClear();
    // Neither call awaits the other, as with two Accept clicks before the first answer.
    const [first, second] = await Promise.all([
      store.decide(stored.proposal, [{ itemId: "i1", action: "accept" }]),
      store.decide(stored.proposal, [{ itemId: "i2", action: "accept" }]),
    ]);
    expect(first).not.toHaveProperty("reason");
    expect(second).not.toHaveProperty("reason");
    expect([first.results, second.results]).toMatchObject([[{ ok: true }], [{ ok: true }]]);
    const versions = decide.mock.calls.map(([, baseVersion]) => baseVersion);
    expect(versions[1]).toBe(versions[0] + 1);
    const amount = (plan: EventDoc, lineId: string) => plan.budget.lines.find((l) => l.id === lineId)?.amount;
    expect(decor(store.getPlan())).toBe(240_000);
    expect(amount(store.getPlan(), "line-venue")).toBeLessThan(amount(wedding(), "line-venue") ?? 0);
    expect((await new EventRepo(deps.db).get(id))?.version).toBe(store.getPlan().version);
    expect(store.undoDepth()).toBe(2);
  });

  it("two quick edits and an undo run in order, with no false conflict", async () => {
    const { store, api } = serverStore();
    const patch = vi.spyOn(api, "patch");
    const results = await Promise.all([
      store.applyManual([DECOR_CUT]),
      store.applyManual([{ type: "set_summary", text: "Mine" }]),
      store.undo(),
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(patch.mock.calls.map(([baseVersion]) => baseVersion)).toEqual([wedding().version, wedding().version + 1]);
    // The undo reverted the newest change (the summary), not the Decor cut.
    expect(decor(store.getPlan())).toBe(240_000);
    expect(store.getPlan().summary.text).not.toBe("Mine");
    expect(store.undoDepth()).toBe(1);
  });

  it("a failed request does not block the ones queued after it", async () => {
    const { store, api } = serverStore();
    vi.spyOn(api, "patch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const [failed, saved] = await Promise.all([store.applyManual([DECOR_CUT]), store.applyManual([DECOR_CUT])]);
    expect(failed).toMatchObject({ ok: false, reason: expect.stringMatching(/Check your connection/) });
    expect(saved).toMatchObject({ ok: true });
  });

  it("stores a browser-built proposal once even when two decisions on it were queued together", async () => {
    const { store, api } = serverStore();
    const create = vi.spyOn(api, "createProposal");
    const proposal = proposalOf([DECOR_CUT, VENUE_CUT]);
    const [first, second] = await Promise.all([
      store.decide(proposal, [{ itemId: "i1", action: "accept" }]),
      store.decide(proposal, [{ itemId: "i2", action: "accept" }]),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(second.proposal.id).toBe(first.proposal.id);
    expect(second.results).toMatchObject([{ ok: true }]);
  });
});

describe("HttpWorkspaceRepository", () => {
  async function open(deps: TestDeps, id: string) {
    const repo = new HttpWorkspaceRepository(
      () => "2026-10-28",
      (eventId) => new HttpPlanApi(eventId, new Api(inProcessFetch(deps))),
    );
    return repo.open(id);
  }

  it("opens the user's event in a server store, and null (404) otherwise", async () => {
    const deps = testDeps();
    const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    const workspace = await open(deps, id);
    expect(workspace?.store.mode).toBe("server");
    expect(workspace?.review).toBe(workspace?.store);
    expect(workspace?.today).toBe("2026-10-28");
    expect(await open(deps, "missing")).toBeNull();
  });

  it("says whether AI is configured, and loads suggestions left waiting (MQW-07, CO-02 regression)", async () => {
    const deps = testDeps();
    const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    const first = await open(deps, id);
    expect(first?.aiAvailable).toBe(false);
    expect(await first?.waitingProposals?.()).toEqual([]);
    const stored = await first?.createProposal({
      touchpoint: "reset",
      origin: "code",
      instruction: "",
      items: [{ op: { type: "reset_section", section: "budget" } }],
    });
    // A later visit (a reload) gets the undecided proposal back.
    const later = await open(deps, id);
    expect((await later?.waitingProposals?.())?.map((p) => p.id)).toEqual([stored?.id]);
    expect((await open({ ...deps, model: fakeModel() }, id))?.aiAvailable).toBe(true);
  });

  it("stores code proposals on the server ('Suggested by Utsav')", async () => {
    const deps = testDeps();
    const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    const workspace = await open(deps, id);
    const proposal = await workspace?.createProposal({
      touchpoint: "reset",
      origin: "code",
      instruction: "",
      items: [{ op: { type: "reset_section", section: "budget" } }],
    });
    expect(proposal).toMatchObject({ id: expect.any(String), origin: "code", items: [{ status: "pending" }] });
  });

  it("asks the event's AI routes, and offers the event settings actions", async () => {
    const deps = testDeps();
    const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: "u1" }, null);
    const repo = new HttpWorkspaceRepository(
      () => "2026-10-28",
      (eventId) => new HttpPlanApi(eventId, new Api(inProcessFetch(deps))),
      (eventId, plan) => new HttpAiClient(eventId, plan, new Api(inProcessFetch(deps))),
    );
    const workspace = await repo.open(id);
    const ideas = await workspace?.ai.ideas({ focus: [], instruction: "" });
    expect(ideas?.proposal).toMatchObject({ id: expect.any(String), origin: "library" });
    expect(workspace?.manage?.calendarHref).toBe(`/api/events/${id}/calendar.ics`);
    expect(await workspace?.manage?.share({ showAmounts: true, showNotes: false })).toMatch(/^https:\/\/utsav\.test\/s\//);
    await workspace?.manage?.revokeShare();
    await expect(workspace?.manage?.remove("wrong")).rejects.toThrow();
    await workspace?.manage?.remove("Marathi-Punjabi wedding");
    expect(await new EventRepo(deps.db).get(id)).toBeNull();
  });
});
