// @vitest-environment node
import { describe, expect, it } from "vitest";
import { budgetRows } from "@/lib/client/budgetTable";
import { announceChange } from "@/lib/domain/announce";
import { formatTime, offsetLabel } from "@/lib/domain/dates";
import type { EventDoc } from "@/lib/domain/model/event";
import { deriveView } from "@/lib/domain/view";
import { tradeoffItem } from "@/lib/plan/smartPlan";
import { logFailure, saveProposal } from "@/lib/server/handlers/ai/gate";
import { smartReplan } from "@/lib/server/handlers/ai/whatif";
import { deleteEvent, getEvent, patchEvent } from "@/lib/server/handlers/event";
import { putReview } from "@/lib/server/handlers/review";
import { createSession } from "@/lib/server/handlers/session";
import { revokeShare, shareEvent } from "@/lib/server/handlers/share";
import { EventRepo, eventPath } from "@/lib/server/repos/events";
import { userPath } from "@/lib/server/repos/users";
import { wedding } from "../../domainFixtures";
import { fakeModel } from "../../helpers/fakeModel";
import { apiRequest, bodyOf, NOW_S, params, testDeps, TODAY, type TestDeps } from "../../helpers/server";

/**
 * The decisions the route-handler and domain suites left untaken (coverage below 90% branches in
 * the QA pass): bad bodies on every write, origin fallbacks, provenance of saved drafts, trade-off
 * defaults, and the sentences the live region reads out.
 */

async function seeded(deps: TestDeps = testDeps()): Promise<{ deps: TestDeps; id: string; event: EventDoc }> {
  const event = { ...wedding(), ownerUid: "u1" };
  const id = await new EventRepo(deps.db).create(event, null);
  return { deps, id, event };
}

describe("writes refuse malformed bodies before touching the event", () => {
  it("DELETE event, PUT review and POST share answer 400 for a body of the wrong shape", async () => {
    const { deps, id, event } = await seeded();
    const del = await deleteEvent(apiRequest("DELETE", `/api/events/${id}`, { body: { title: "x" } }), deps, params({ id }));
    const review = await putReview(
      apiRequest("PUT", `/api/events/${id}/review`, { body: { section: "nope", state: "reviewed" } }),
      deps,
      params({ id }),
    );
    const share = await shareEvent(apiRequest("POST", `/api/events/${id}/share`, { body: { showAmounts: "yes" } }), deps, params({ id }));
    expect([del.status, review.status, share.status]).toEqual([400, 400, 400]);
    expect((await new EventRepo(deps.db).get(id))?.version).toBe(event.version);
  });

  it("refuses a delete whose typed title does not match, naming the title to type", async () => {
    const { deps, id } = await seeded();
    const response = await deleteEvent(
      apiRequest("DELETE", `/api/events/${id}`, { body: { confirmTitle: "Wrong" } }),
      deps,
      params({ id }),
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await bodyOf(response))).toMatch(/to confirm/);
    expect(await deps.db.get(eventPath(id))).not.toBeNull();
  });
});

describe("saved enquiry drafts keep their provenance only when unchanged (spec 8.2)", () => {
  const vendorOf = (event: EventDoc) => event.vendors[0];
  const draft = (body: string) => ({ channel: "whatsapp" as const, language: "en" as const, subject: "", body });

  async function saveDraft(
    generated: { vendorId?: string; body: string } | null,
    sentBody: string,
    generatedDraftId: string | null = "gen-1",
  ) {
    const { deps, id, event } = await seeded();
    const vendor = vendorOf(event);
    if (generated)
      deps.caches.generatedDrafts.set(`u1:${id}:gen-1`, { vendorId: generated.vendorId ?? vendor.id, body: generated.body, origin: "ai" });
    const response = await patchEvent(
      apiRequest("PATCH", `/api/events/${id}`, {
        body: {
          baseVersion: event.version,
          ops: [{ type: "save_draft", vendorId: vendor.id, draft: draft(sentBody), ...(generatedDraftId ? { generatedDraftId } : {}) }],
        },
      }),
      deps,
      params({ id }),
    );
    expect(response.status).toBe(200);
    const stored = (await new EventRepo(deps.db).get(id)) as EventDoc;
    return stored.vendors.find((v) => v.id === vendor.id)?.drafts.at(-1)?.origin;
  }

  it("an AI draft saved exactly as generated stays `ai`", async () => {
    expect(await saveDraft({ body: "Hello [Vendor name]" }, "Hello [Vendor name]")).toBe("ai");
  });

  it("an edited body, another vendor's draft, an unknown id or no id is the user's", async () => {
    expect(await saveDraft({ body: "Hello [Vendor name]" }, "Hello [Vendor name], thanks")).toBe("user");
    expect(await saveDraft({ vendorId: "someone-else", body: "Hello" }, "Hello")).toBe("user");
    expect(await saveDraft(null, "Hello")).toBe("user");
    expect(await saveDraft({ body: "Hello" }, "Hello", null)).toBe("user");
  });
});

describe("sign-in and sharing fallbacks", () => {
  it("creates a profile from a token that has no name, photo or email", async () => {
    const deps = testDeps();
    deps.auth.verifyIdToken = async () => ({ uid: "bare", auth_time: NOW_S });
    const response = await createSession(apiRequest("POST", "/api/session", { cookie: null, body: { idToken: "id:bare:0" } }), deps);
    expect(response.status).toBe(200);
    expect(await deps.db.get(userPath("bare"))).toMatchObject({ displayName: "", photoURL: null, email: "" });
  });

  it("builds the share URL from the request origin when APP_ORIGIN is not set", async () => {
    const { deps, id } = await seeded({ ...testDeps(), appOrigin: null });
    const response = await shareEvent(
      apiRequest("POST", `/api/events/${id}/share`, { body: { showAmounts: true, showNotes: false } }),
      deps,
      params({ id }),
    );
    expect(((await bodyOf(response)) as { url: string }).url).toMatch(/^https:\/\/utsav\.test\/s\/[A-Za-z0-9_-]{43}$/);
  });

  it("turning off a link that was never created is a no-op 204", async () => {
    const { deps, id, event } = await seeded();
    const response = await revokeShare(apiRequest("DELETE", `/api/events/${id}/share`), deps, params({ id }));
    expect(response.status).toBe(204);
    expect((await new EventRepo(deps.db).get(id))?.share).toEqual(event.share);
  });

  it("a share or revoke for an unknown event is a 404", async () => {
    const deps = testDeps();
    expect(
      (
        await shareEvent(
          apiRequest("POST", "/api/events/nope/share", { body: { showAmounts: true, showNotes: false } }),
          deps,
          params({ id: "nope" }),
        )
      ).status,
    ).toBe(404);
    expect((await revokeShare(apiRequest("DELETE", "/api/events/nope/share"), deps, params({ id: "nope" }))).status).toBe(404);
    expect((await getEvent(apiRequest("GET", "/api/events/nope"), deps, params({ id: "nope" }))).status).toBe(404);
  });
});

describe("AI gate and What-if edges", () => {
  it("logs a failure without its message, and `unknown` for a non-Error", () => {
    const deps = testDeps();
    const seen: unknown[] = [];
    deps.log = (event, fields) => void seen.push([event, fields]);
    logFailure(deps, "whatif", new TypeError("secret prompt text"));
    logFailure(deps, "whatif", "a string");
    expect(seen).toEqual([
      ["ai_failed", { touchpoint: "whatif", error: "TypeError" }],
      ["ai_failed", { touchpoint: "whatif", error: "unknown" }],
    ]);
    expect(JSON.stringify(seen)).not.toContain("secret");
  });

  it("saveProposal is null when the event is gone", async () => {
    const deps = testDeps();
    const call = {
      db: deps.db,
      eventId: "gone",
      session: { uid: "u1", email: "", name: "", picture: null },
      clock: deps.clock(),
      event: wedding(),
    };
    expect(
      await saveProposal(call as never, { touchpoint: "whatif", origin: "ai", instruction: "", items: [], model: "m", filtered: false }),
    ).toBeNull();
  });

  it("a cached re-plan answers with the model id `cached` when the model is gone", async () => {
    const model = fakeModel({ json: [{ lines: [{ category: "Decor", percent: 10 }], notes: [], tradeoffs: [] }] });
    const { deps, id } = await seeded(testDeps({ model }));
    const first = await smartReplan(
      apiRequest("POST", `/api/events/${id}/ai/whatif`, { body: { newTotal: 2_000_000 } }),
      deps,
      params({ id }),
    );
    expect(first.status).toBe(200);
    deps.model = null;
    const second = await smartReplan(
      apiRequest("POST", `/api/events/${id}/ai/whatif`, { body: { newTotal: 2_000_000 } }),
      deps,
      params({ id }),
    );
    expect(second.status).toBe(200);
    expect((await bodyOf(second)) as { tradeoffs: { model: string; id?: string } }).toMatchObject({ tradeoffs: { model: "cached" } });
    expect(model.requests).toHaveLength(1);
  });
});

describe("trade-offs become cards with sensible defaults", () => {
  it("a task without a lead time is due 14 days before", () => {
    expect(tradeoffItem({ kind: "task", title: "Ask for a buffet", detail: "Cheaper per plate", category: "Catering" })).toEqual({
      op: { type: "add_task", title: "Ask for a buffet", category: "Catering", daysBefore: 14 },
      rationale: "Cheaper per plate",
    });
  });

  it("an idea keeps a known category in any case, falls back to `experience`, and has no cost unless given", () => {
    const food = tradeoffItem({ kind: "idea", title: "Chaat counter", detail: "Live counter", category: "FOOD", estimatedCost: 5000 });
    const other = tradeoffItem({ kind: "idea", title: "Drone show", detail: "x".repeat(200), category: "Spectacle" });
    expect(food.op).toMatchObject({ type: "add_idea", idea: { category: "food", estimatedCost: 5000 } });
    expect(other.op).toMatchObject({ type: "add_idea", idea: { category: "experience", estimatedCost: null } });
    expect(other.rationale).toHaveLength(160);
  });
});

describe("budget rows without money yet", () => {
  it("a line with no vendor money shows zero committed and paid, and its whole amount as variance", () => {
    const plan = wedding();
    const view = { ...deriveView(plan, TODAY), moneyByLine: new Map() };
    const [first] = budgetRows(plan, view);
    expect(first).toMatchObject({ committed: 0, paid: 0, variance: plan.budget.lines[0].amount });
  });
});

describe("live-region sentences (announceChange)", () => {
  const plan = wedding();
  const decor = plan.budget.lines.find((l) => l.id === "line-decor") as EventDoc["budget"]["lines"][number];

  it("names one adjusted category, or the first and a count", () => {
    const one = structuredClone(plan);
    const lines = one.budget.lines;
    const other = lines.find((l) => l.id !== decor.id && l.category !== "Contingency") as typeof decor;
    lines.find((l) => l.id === decor.id)!.amount -= 1000;
    other.amount += 1000;
    expect(
      announceChange(
        plan,
        one,
        { type: "adjust_budget_category", lineId: decor.id, mode: "set_amount", value: decor.amount - 1000, rebalance: "spread_to_others" },
        TODAY,
      ),
    ).toMatch(new RegExp(`${other.category} adjusted; total unchanged`));
  });

  it("says nothing about function amounts when there are no functions", () => {
    const before = { ...structuredClone(plan), functions: [] };
    const after = structuredClone(before);
    after.budget.total += 10_000;
    after.budget.lines.find((l) => l.id === decor.id)!.amount += 10_000;
    const sentence = announceChange(
      before,
      after,
      { type: "adjust_budget_category", lineId: decor.id, mode: "change_amount", value: 10_000, rebalance: "change_total" },
      TODAY,
    );
    expect(sentence).toMatch(/Total is now/);
    expect(sentence).not.toMatch(/function amounts/);
  });

  it("is silent about a line that no longer exists", () => {
    const after = structuredClone(plan);
    after.budget.lines = after.budget.lines.filter((l) => l.id !== decor.id);
    expect(
      announceChange(
        plan,
        after,
        { type: "adjust_budget_category", lineId: decor.id, mode: "set_amount", value: 1, rebalance: "change_total" },
        TODAY,
      ),
    ).not.toMatch(/Decor set to/);
  });
});

describe("times and offsets read naturally", () => {
  it("formats the 12-hour clock around midnight and noon", () => {
    expect(formatTime("00:05")).toBe("12:05 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("23:59")).toBe("11:59 pm");
  });

  it("labels signed offsets in days", () => {
    expect([offsetLabel(0), offsetLabel(1), offsetLabel(-1), offsetLabel(-3), offsetLabel(30)]).toEqual([
      "Event day",
      "1 day before",
      "1 day after",
      "3 days after",
      "30 days before",
    ]);
  });
});
