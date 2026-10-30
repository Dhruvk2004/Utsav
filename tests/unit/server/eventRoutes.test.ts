// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PlanModel } from "@/lib/ai/model";
import type { EventDoc } from "@/lib/domain/model/event";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { CREATION_HISTORY_ID } from "@/lib/plan/commands";
import { deleteEvent, getEvent, patchEvent } from "@/lib/server/handlers/event";
import { createEvent, listEvents } from "@/lib/server/handlers/events";
import { putReview } from "@/lib/server/handlers/review";
import { undo } from "@/lib/server/handlers/undo";
import { EventRepo, historyPath } from "@/lib/server/repos/events";
import { UserRepo } from "@/lib/server/repos/users";
import { DECOR_CUT } from "../../contracts/planStoreContract";
import { wedding } from "../../domainFixtures";
import { makeDraft } from "../../fixtures";
import { fakeModel } from "../../helpers/fakeModel";
import { apiRequest, bodyOf, createRequest, params, sessionCookie, testDeps, type TestDeps } from "../../helpers/server";

const draftModel = (): PlanModel & { prompts: string[] } => {
  const prompts: string[] = [];
  return {
    name: "fake",
    prompts,
    generateJson: async ({ prompt }) => (prompts.push(prompt), JSON.stringify(makeDraft())),
    callTools: async () => [],
  };
};

async function created(deps: TestDeps, body = createRequest()): Promise<{ eventId: string; source: string }> {
  const response = await createEvent(apiRequest("POST", "/api/events", { body }), deps);
  expect(response.status).toBe(201);
  return (await response.json()) as { eventId: string; source: string };
}

async function seeded(deps: TestDeps, plan: EventDoc = { ...wedding(), ownerUid: "u1" }) {
  return new EventRepo(deps.db).create(plan, null);
}

describe("POST /api/events", () => {
  it("generates an AI plan without the title, names or notes in the prompt, with a creation entry", async () => {
    const model = draftModel();
    const deps = testDeps({ model });
    const { eventId, source } = await created(deps);
    expect(source).toBe("ai");
    expect(model.prompts[0]).not.toMatch(/Ananya|Rohan|lilies/);
    const event = await new EventRepo(deps.db).get(eventId);
    expect(event).toMatchObject({ ownerUid: "u1", source: "ai", version: 1, details: { title: "Ananya & Rohan's wedding" } });
    expect(planInvariantViolations(event as EventDoc)).toEqual([]);
    expect(deps.db.docs.get(historyPath(eventId, CREATION_HISTORY_ID))).toMatchObject({ actor: "system", versionAfter: 1 });
    expect((await new UserRepo(deps.db).get("u1"))?.aiUsage.count).toBe(1);
  });

  it("serves a repeated request from the per-user cache without another model call or quota use", async () => {
    const model = draftModel();
    const deps = testDeps({ model });
    await created(deps);
    await created(deps, createRequest({ title: "Another title" }));
    expect(model.prompts).toHaveLength(1);
    expect((await new UserRepo(deps.db).get("u1"))?.aiUsage.count).toBe(1);
  });

  it("falls back to the starter template without a model, and makes blank plans without AI", async () => {
    const deps = testDeps();
    expect((await created(deps)).source).toBe("template");
    const blank = await created(deps, createRequest({ mode: "blank" }));
    expect(blank.source).toBe("blank");
    const event = await new EventRepo(deps.db).get(blank.eventId);
    expect(event).toMatchObject({ source: "blank", review: null });
    expect(deps.db.docs.has(historyPath(blank.eventId, CREATION_HISTORY_ID))).toBe(false);
  });

  it("logs failed model attempts before falling back", async () => {
    const deps = testDeps({ model: { name: "broken", generateJson: async () => "not json", callTools: async () => [] } });
    expect((await created(deps)).source).toBe("template");
    expect(deps.logs.filter((log) => log === "plan_attempt_failed")).toHaveLength(2);
  });

  it("validates the body and today's date rules", async () => {
    const deps = testDeps();
    const past = await createEvent(
      apiRequest("POST", "/api/events", { body: createRequest({ eventDate: "2026-01-01", functions: [] }) }),
      deps,
    );
    expect(past.status).toBe(400);
    expect(await bodyOf(past)).toMatchObject({ error: { fields: { eventDate: expect.stringMatching(/^Pick a date/) } } });
    expect((await createEvent(apiRequest("POST", "/api/events", { body: { ...createRequest(), ownerUid: "u2" } }), deps)).status).toBe(400);
  });

  it("limits AI plans per minute and per day", async () => {
    const deps = testDeps({ model: draftModel() });
    for (let i = 0; i < 6; i++) await created(deps, createRequest({ guestCount: 100 + i }));
    const limited = await createEvent(apiRequest("POST", "/api/events", { body: createRequest({ guestCount: 200 }) }), deps);
    expect(limited.status).toBe(429);

    const daily = testDeps({ model: draftModel() });
    await new UserRepo(daily.db).ensure("u1", { displayName: "", photoURL: null, email: "" }, "2026-10-28", "2026-10-28T06:00:00.000Z");
    daily.db.docs.set("users/u1", { ...daily.db.docs.get("users/u1"), aiUsage: { day: "2026-10-28", count: 60 } });
    const quota = await createEvent(apiRequest("POST", "/api/events", { body: createRequest() }), daily);
    expect(quota.status).toBe(429);
    expect(await bodyOf(quota)).toMatchObject({ error: { message: expect.stringMatching(/today's AI suggestions/) } });
  });
});

describe("GET /api/events and /api/events/[id]", () => {
  it("lists only the user's dashboard cards", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    await seeded(deps, { ...wedding(), ownerUid: "u2" });
    const { events } = (await bodyOf(await listEvents(apiRequest("GET", "/api/events"), deps))) as { events: { id: string }[] };
    expect(events.map((event) => event.id)).toEqual([id]);
  });

  it("returns the owner's event and a 404 (never 403) to anyone else", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    // `ai.available` tells the workspace up front that this deployment has no model (MQW-07).
    expect(await bodyOf(await getEvent(apiRequest("GET", `/api/events/${id}`), deps, params({ id })))).toMatchObject({
      event: { ownerUid: "u1" },
      ai: { available: false },
    });
    expect(
      await bodyOf(await getEvent(apiRequest("GET", `/api/events/${id}`), { ...deps, model: fakeModel() }, params({ id }))),
    ).toMatchObject({ ai: { available: true } });
    expect((await getEvent(apiRequest("GET", `/api/events/${id}`, { cookie: sessionCookie("u2") }), deps, params({ id }))).status).toBe(
      404,
    );
    expect((await getEvent(apiRequest("GET", "/api/events/x", { cookie: null }), deps, params({ id: "x" }))).status).toBe(401);
  });
});

describe("PATCH /api/events/[id]", () => {
  const patch = (deps: TestDeps, id: string, body: unknown, cookie?: string) =>
    patchEvent(apiRequest("PATCH", `/api/events/${id}`, { body, cookie }), deps, params({ id }));

  it("applies manual ops on the current version and returns the event and history id", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const response = await patch(deps, id, { baseVersion: wedding().version, ops: [DECOR_CUT] });
    const body = (await response.json()) as { event: EventDoc; historyId: string };
    expect(body.event.version).toBe(wedding().version + 1);
    expect(deps.db.docs.has(historyPath(id, body.historyId))).toBe(true);
  });

  it("answers a stale version with 409 and the latest event", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const response = await patch(deps, id, { baseVersion: 0, ops: [DECOR_CUT] });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({ error: { code: "version_conflict" }, event: { version: wedding().version } });
  });

  it("answers a rejected op with 422 and per-op results, and rejects provenance in payloads", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const rejected = await patch(deps, id, { baseVersion: wedding().version, ops: [{ type: "remove_task", taskId: "nope" }] });
    expect(rejected.status).toBe(422);
    expect(await bodyOf(rejected)).toMatchObject({ results: [{ ok: false }] });
    const idea = {
      title: "Lanterns",
      description: "",
      category: "decor",
      estimatedCost: null,
      costBasis: "per event",
      basis: [],
      effort: "diy",
      origin: "ai",
    };
    expect((await patch(deps, id, { baseVersion: wedding().version, ops: [{ type: "add_idea", idea }] })).status).toBe(400);
  });

  it("is a 404 for another user's event and refuses oversized bodies", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    expect((await patch(deps, id, { baseVersion: 1, ops: [DECOR_CUT] }, sessionCookie("u2"))).status).toBe(404);
    expect((await patch(deps, id, { baseVersion: 1, ops: [{ type: "set_summary", text: "x".repeat(17_000) }] })).status).toBe(413);
  });
});

describe("POST /api/events/[id]/undo", () => {
  it("undoes this user's latest change, and refuses once the plan moved on", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    const applied = (await bodyOf(
      await patchEvent(
        apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion: wedding().version, ops: [DECOR_CUT] } }),
        deps,
        params({ id }),
      ),
    )) as { historyId: string };
    const undone = await undo(
      apiRequest("POST", `/api/events/${id}/undo`, { body: { historyId: applied.historyId } }),
      deps,
      params({ id }),
    );
    expect(((await undone.json()) as { event: EventDoc }).event.budget.lines.find((line) => line.id === "line-decor")?.amount).toBe(
      300_000,
    );
    const again = await undo(
      apiRequest("POST", `/api/events/${id}/undo`, { body: { historyId: applied.historyId } }),
      deps,
      params({ id }),
    );
    expect(again.status).toBe(409);
    expect(
      (await undo(apiRequest("POST", `/api/events/${id}/undo`, { body: { historyId: "missing" } }), deps, params({ id }))).status,
    ).toBe(404);
  });

  it("starts an AI plan over from the starter template through its creation entry", async () => {
    const deps = testDeps({ model: draftModel() });
    const { eventId } = await created(deps);
    const response = await undo(
      apiRequest("POST", `/api/events/${eventId}/undo`, { body: { historyId: CREATION_HISTORY_ID } }),
      deps,
      params({ id: eventId }),
    );
    const { event } = (await response.json()) as { event: EventDoc };
    expect(event).toMatchObject({ source: "template", version: 2, review: { budget: "reset", ideas: "reset" }, ideas: [] });
    expect(planInvariantViolations(event)).toEqual([]);
  });
});

describe("PUT /api/events/[id]/review", () => {
  it("marks a section reviewed without a version bump", async () => {
    const deps = testDeps();
    const id = await seeded(deps, {
      ...wedding(),
      ownerUid: "u1",
      review: { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" },
    });
    const response = await putReview(
      apiRequest("PUT", `/api/events/${id}/review`, { body: { section: "budget", state: "reviewed" } }),
      deps,
      params({ id }),
    );
    expect(await bodyOf(response)).toEqual({ review: { budget: "reviewed", timeline: "pending", vendors: "pending", ideas: "pending" } });
    expect((await new EventRepo(deps.db).get(id))?.version).toBe(wedding().version);
  });

  it("is a 404 for a plan with no review, or someone else's", async () => {
    const deps = testDeps();
    const id = await seeded(deps);
    expect(
      (
        await putReview(
          apiRequest("PUT", `/api/events/${id}/review`, { body: { section: "budget", state: "reviewed" } }),
          deps,
          params({ id }),
        )
      ).status,
    ).toBe(404);
  });
});

describe("DELETE /api/events/[id]", () => {
  it("needs the title typed to confirm, then deletes", async () => {
    const deps = testDeps();
    const id = await seeded(deps, { ...wedding(), ownerUid: "u1", details: { ...wedding().details, title: "" } });
    const wrong = await deleteEvent(apiRequest("DELETE", `/api/events/${id}`, { body: { confirmTitle: "Party" } }), deps, params({ id }));
    expect(await bodyOf(wrong)).toMatchObject({ error: { fields: { confirmTitle: "Type “Wedding” to confirm." } } });
    expect(
      (await deleteEvent(apiRequest("DELETE", `/api/events/${id}`, { body: { confirmTitle: " Wedding " } }), deps, params({ id }))).status,
    ).toBe(204);
    expect(await new EventRepo(deps.db).get(id)).toBeNull();
    expect(
      (await deleteEvent(apiRequest("DELETE", `/api/events/${id}`, { body: { confirmTitle: "Wedding" } }), deps, params({ id }))).status,
    ).toBe(404);
  });
});
