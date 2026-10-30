// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RECORDINGS } from "@/lib/demo/recordings";
import type { Proposal } from "@/lib/domain/model/records";
import { applyOperations } from "@/lib/domain/ops/apply";
import { proposableOperationSchema } from "@/lib/domain/ops/schema";
import { DEMO_DAILY_CAP, DEMO_USAGE_PATH, demoQuotaFor, FirestoreDemoQuota, MemoryDemoQuota } from "@/lib/server/demoQuota";
import { demoIdeas } from "@/lib/server/handlers/demo/ideas";
import { demoInstruct } from "@/lib/server/handlers/demo/instruct";
import { demoAiStatus } from "@/lib/server/handlers/demo/status";
import { DEMO_INSTRUCTION_MAX, DEMO_MAX_BODY_BYTES, replay } from "@/lib/server/handlers/demo/sandbox";
import { SANDBOX_MAX_OPS, SANDBOX_MAX_TURNS } from "@/lib/plan/SandboxPlanStore";
import { call, fakeModel } from "../../helpers/fakeModel";
import { MemoryDb } from "../../helpers/memoryDb";
import { apiRequest, bodyOf, params, testDeps, TODAY, type TestDeps } from "../../helpers/server";

/** The public demo's AI routes (spec 5.10): replay, limits, the daily cap and recorded fallbacks. */

type Answer = { proposal: Proposal; recorded: boolean; reason?: "busy" | "off" };

const DECOR_CUT_CALL = call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -20, rebalance: "change_total" });
const IDEA = {
  title: "Peppa Pig photo corner",
  description: "A painted backdrop",
  category: "decor",
  estimatedCost: 4000,
  costBasis: "per event",
  basis: ["honoree.interests:Peppa Pig"],
  effort: "diy",
};

function post(handler: typeof demoInstruct, deps: TestDeps, sample: string, body: unknown, ip = "203.0.113.7", route = "instruct") {
  return handler(
    apiRequest("POST", `/api/demo/${sample}/ai/${route}`, { body, cookie: null, headers: { "x-forwarded-for": `10.0.0.1, ${ip}` } }),
    deps,
    params({ sample }),
  );
}
const instruct = (deps: TestDeps, body: Record<string, unknown>, ip?: string, sample = "wedding") =>
  post(demoInstruct, deps, sample, { appliedOps: [], ...body }, ip);
const ideas = (deps: TestDeps, body: Record<string, unknown>, ip?: string, sample = "birthday") =>
  post(demoIdeas, deps, sample, { appliedOps: [], ...body }, ip, "ideas");
const answerOf = async (response: Response) => (await response.json()) as Answer;

describe("POST /api/demo/[sample]/ai/instruct", () => {
  it("answers live on the replayed sample, with nothing stored and no sign-in", async () => {
    const model = fakeModel({ tools: [[DECOR_CUT_CALL]] });
    const deps = testDeps({ model });
    const response = await instruct(deps, { instruction: "Cut decor spend by 20%", tab: "budget" });
    expect(response.status).toBe(200);
    const { proposal, recorded } = await answerOf(response);
    expect(recorded).toBe(false);
    expect(proposal.items).toEqual([expect.objectContaining({ status: "pending", op: expect.objectContaining({ lineId: "line-decor" }) })]);
    expect(deps.db.docs.size).toBe(0);
  });

  it("is a 404 for an unknown sample and a 400 for a bad body", async () => {
    const deps = testDeps();
    expect((await instruct(deps, { instruction: "Hi" }, undefined, "office")).status).toBe(404);
    expect((await instruct(deps, { instruction: "" })).status).toBe(400);
    expect((await instruct(deps, { instruction: "x".repeat(DEMO_INSTRUCTION_MAX + 1) })).status).toBe(400);
    // Manual-only ops cannot be replayed, so the schema refuses them.
    expect((await instruct(deps, { instruction: "Hi", appliedOps: [{ type: "set_summary", text: "x" }] })).status).toBe(400);
  });

  it("refuses a body over 8 KB with 413 before parsing it", async () => {
    const deps = testDeps();
    const response = await instruct(deps, { instruction: "Hi", padding: "x".repeat(DEMO_MAX_BODY_BYTES) });
    expect(response.status).toBe(413);
  });

  it("fits the largest realistic body (20 ops, 4 full turns) within the limit", async () => {
    const appliedOps = Array.from({ length: SANDBOX_MAX_OPS }, (_, i) => ({
      type: "add_task",
      title: `Confirm the welcome-desk volunteers and their shift timings, round ${String(i + 1).padStart(2, "0")}`,
      category: "Logistics",
      daysBefore: 30,
    }));
    const previousTurns = Array.from({ length: SANDBOX_MAX_TURNS }, () => ({
      instruction: "y".repeat(DEMO_INSTRUCTION_MAX),
      items: Array.from({ length: 3 }, () => ({
        summary: "Add task “Confirm the welcome-desk volunteers and their shift timings” (Logistics, 30 days before)",
        status: "accepted",
      })),
    }));
    const replacingOps = Array.from({ length: SANDBOX_MAX_OPS }, (_, i) => i);
    const body = { instruction: "z".repeat(DEMO_INSTRUCTION_MAX), tab: "timeline", appliedOps, replacingOps, previousTurns };
    expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThan(DEMO_MAX_BODY_BYTES);
    expect((await instruct(testDeps(), body)).status).toBe(200);
  });

  it("refuses ops that do not replay onto the pristine sample (SANDBOX_STATE_INVALID)", async () => {
    const response = await instruct(testDeps(), { instruction: "Hi", appliedOps: [{ type: "remove_task", taskId: "task-none" }] });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ error: { code: "SANDBOX_STATE_INVALID" } });
  });

  it("answers with a recording, re-checked against the sandbox, without a model or when it fails", async () => {
    const none = await answerOf(await instruct(testDeps(), { instruction: "Cut decor spend by 20%" }));
    expect(none.recorded).toBe(true);
    expect(none.proposal).toMatchObject({ fallback: true, instruction: "Cut decor spend by 20%" });
    expect(none.proposal.items).toHaveLength(RECORDINGS.wedding.instruct[0].items.length);
    expect(none.proposal.items.every((item) => item.status === "pending")).toBe(true);

    expect(none.reason).toBe("off");

    const deps = testDeps({ model: fakeModel({ tools: [new Error("down")] }) });
    const busy = await answerOf(await instruct(deps, { instruction: "Cut decor" }));
    expect(busy).toMatchObject({ recorded: true, reason: "busy" });
    expect(deps.logs).toContain("ai_failed");
  });

  it("never answers with a recording of a different request (MQW-08 regression)", async () => {
    // "Raise the sangeet budget by ₹50,000" has no recording: no decor-cut cards, just a reply saying what is covered.
    const answer = await answerOf(await instruct(testDeps(), { instruction: "Sangeet ka budget 50 hazaar badha do" }));
    expect(answer).toMatchObject({ recorded: true, reason: "off" });
    expect(answer.proposal.items).toEqual([]);
    expect(answer.proposal.reply).toMatch(
      /^Live AI isn't available in this demo, and recorded examples only cover "Cut decor spend by 20%"/,
    );
    const busy = await answerOf(
      await instruct(testDeps({ model: fakeModel({ tools: [new Error("down")] }) }), { instruction: "Add a sangeet DJ" }),
    );
    expect(busy.proposal.reply).toMatch(/^Live AI is busy right now/);
  });

  it('measures a live "instead" follow-up from before the accepted cut (MQW-06 regression)', async () => {
    const appliedOps = [
      { type: "adjust_budget_category", lineId: "line-decor", mode: "percent_change", value: -20, rebalance: "change_total" },
    ];
    const model = fakeModel({
      tools: [[call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -15, rebalance: "change_total" })]],
    });
    const deps = testDeps({ model });
    const live = await answerOf(await instruct(deps, { instruction: "make that 15% instead", appliedOps }));
    expect(live.recorded).toBe(false);
    expect(live.proposal.items[0].op).toMatchObject({ mode: "set_amount", value: 255_000 });
    // The cached draft is re-measured the same way.
    const cached = await answerOf(await instruct(deps, { instruction: "make that 15% instead", appliedOps }));
    expect(cached.proposal.items[0].op).toMatchObject({ mode: "set_amount", value: 255_000 });
  });

  it('measures a second live "instead" from the same original amount (MQR-02 d regression)', async () => {
    // Accepted: the 20% cut, then "make that 15% instead", which the server rewrote to ₹2,55,000.
    const appliedOps = [
      { type: "adjust_budget_category", lineId: "line-decor", mode: "percent_change", value: -20, rebalance: "change_total" },
      { type: "adjust_budget_category", lineId: "line-decor", mode: "set_amount", value: 255_000, rebalance: "change_total" },
    ];
    const tenPercent = () =>
      fakeModel({
        tools: [[call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -10, rebalance: "change_total" })]],
      });
    const marked = await answerOf(
      await instruct(testDeps({ model: tenPercent() }), { instruction: "No, make it 10% instead", appliedOps, replacingOps: [1] }),
    );
    expect(marked.proposal.items[0].op).toMatchObject({ mode: "set_amount", value: 270_000 });
    // Without the marks the rewrite counts as a fresh change and the cut stacks (the bug: 10% off ₹2,40,000).
    const unmarked = await answerOf(
      await instruct(testDeps({ model: tenPercent() }), { instruction: "No, make it 10% instead", appliedOps }),
    );
    expect(unmarked.proposal.items[0].op).toMatchObject({ mode: "set_amount", value: 216_000 });
    expect((await instruct(testDeps(), { instruction: "Hi", replacingOps: [SANDBOX_MAX_OPS] })).status).toBe(400);
    expect((await instruct(testDeps(), { instruction: "Hi", replacingOps: [-1] })).status).toBe(400);
  });

  it('applies a live "instead" to the current amount when no earlier cut is in effect (MQR-02)', async () => {
    // The accepted cut was undone, so `appliedOps` is empty: a 15% cut of ₹3,00,000, not an increase.
    const model = fakeModel({
      tools: [[call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -15, rebalance: "change_total" })]],
    });
    const live = await answerOf(await instruct(testDeps({ model }), { instruction: "make that 15% instead", appliedOps: [] }));
    expect(live.proposal.items[0].op).toMatchObject({ mode: "percent_change", value: -15 });
    expect(live.proposal.items[0].summary).toMatch(/₹3,00,000 -> ₹2,55,000/);
  });

  it("limits live AI to 5 calls an hour per IP, then answers with recordings", async () => {
    const model = fakeModel({ tools: [[DECOR_CUT_CALL]] });
    const deps = testDeps({ model });
    for (let i = 0; i < 5; i++) expect((await answerOf(await instruct(deps, { instruction: `Cut decor ${i}` }))).recorded).toBe(false);
    expect((await answerOf(await instruct(deps, { instruction: "Cut decor 6" }))).recorded).toBe(true);
    expect(model.requests).toHaveLength(5);
    // The rightmost X-Forwarded-For hop is the client, so another visitor still gets live AI.
    expect((await answerOf(await instruct(deps, { instruction: "Cut decor 7" }, "198.51.100.9"))).recorded).toBe(false);
  });

  it("stops live AI for everyone at the global daily cap", async () => {
    const model = fakeModel({ tools: [[DECOR_CUT_CALL]] });
    const deps = { ...testDeps({ model }), demoQuota: new MemoryDemoQuota(1) };
    expect((await answerOf(await instruct(deps, { instruction: "Cut decor" }, "198.51.100.1"))).recorded).toBe(false);
    expect((await answerOf(await instruct(deps, { instruction: "Cut decor" }, "198.51.100.2"))).recorded).toBe(false);
    expect((await answerOf(await instruct(deps, { instruction: "Cut decor more" }, "198.51.100.3"))).recorded).toBe(true);
    expect(model.requests).toHaveLength(1);
  });

  it("serves a repeated request from the cache without spending the visitor's limit", async () => {
    const model = fakeModel({ tools: [[DECOR_CUT_CALL]] });
    const deps = testDeps({ model });
    await instruct(deps, { instruction: "Cut decor" });
    expect((await answerOf(await instruct(deps, { instruction: "Cut decor" }))).recorded).toBe(false);
    expect(model.requests).toHaveLength(1);
    // One of the visitor's five live calls is spent: four remain.
    const left = Array.from({ length: 5 }, () => deps.limits.demo.check("203.0.113.7").allowed);
    expect(left).toEqual([true, true, true, true, false]);
  });

  it("accepts a card, then a second instruction builds on the new amount (spec 5.10)", async () => {
    const deps = testDeps();
    const first = await answerOf(await instruct(deps, { instruction: "Cut decor spend by 20%" }));
    const accepted = first.proposal.items[0];
    expect(accepted.op).toMatchObject({ type: "adjust_budget_category", lineId: "line-decor" });
    const appliedOps = [proposableOperationSchema.parse(accepted.op)];
    const previousTurns = [
      {
        instruction: first.proposal.instruction,
        items: first.proposal.items.map((item, i) => ({ summary: item.summary, status: i === 0 ? "accepted" : "declined" })),
      },
    ];

    // The recorded follow-up is dry-run against the replayed sample, where decor is now ₹2,40,000.
    const second = await answerOf(await instruct(deps, { instruction: "Make that 15% instead", appliedOps, previousTurns }));
    expect(second.recorded).toBe(true);
    expect(second.proposal.items).toEqual([
      expect.objectContaining({ status: "pending", op: expect.objectContaining({ mode: "set_amount", value: 255_000 }) }),
    ]);
    const sandbox = replay("wedding", appliedOps, TODAY);
    expect(sandbox?.plan.budget.lines.find((line) => line.id === "line-decor")?.amount).toBe(240_000);
    const after = applyOperations(sandbox!.plan, [second.proposal.items[0].op], { today: TODAY, actor: "user" });
    expect(after.plan.budget.lines.find((line) => line.id === "line-decor")?.amount).toBe(255_000);

    // Live, the model sees the replayed amount and the earlier turn with what happened to each card.
    const model = fakeModel({ tools: [[call("adjust_budget_category", { category: "Decor", mode: "set_amount", value: 255_000 })]] });
    const live = await answerOf(await instruct(testDeps({ model }), { instruction: "Make that 15% instead", appliedOps, previousTurns }));
    expect(live.recorded).toBe(false);
    expect(live.proposal.items[0].status).toBe("pending");
    expect(model.prompts[0]).toMatch(/"amount": 240000/);
    expect(model.prompts[0]).toMatch(/Earlier requests[\s\S]*Cut decor spend by 20%[\s\S]*"status": "accepted"/);
  });
});

describe("GET /api/demo/[sample]/ai (MQR-03)", () => {
  it("says whether this deployment has live AI, and 404s an unknown sample", async () => {
    expect(await (await demoAiStatus(testDeps({ model: fakeModel() }), params({ sample: "wedding" }))).json()).toEqual({ live: true });
    expect(await (await demoAiStatus(testDeps(), params({ sample: "birthday" }))).json()).toEqual({ live: false });
    expect((await demoAiStatus(testDeps(), params({ sample: "office" }))).status).toBe(404);
  });
});

describe("POST /api/demo/[sample]/ai/ideas", () => {
  it("answers live with the visitor's dismissed titles kept out", async () => {
    const model = fakeModel({ json: [{ ideas: [IDEA] }] });
    const deps = testDeps({ model });
    const { proposal, recorded } = await answerOf(await ideas(deps, { focus: ["decor"], dismissedTitles: ["Bouncy Castle Hire"] }));
    expect(recorded).toBe(false);
    expect(proposal).toMatchObject({ touchpoint: "ideas", items: [{ status: "pending", op: { idea: { title: IDEA.title } } }] });
    expect(model.prompts[0]).toContain("bouncy castle hire");
    await ideas(deps, { focus: ["decor"], dismissedTitles: ["Bouncy Castle Hire"] });
    expect(model.requests).toHaveLength(1);
  });

  it("falls back to the sample's recorded ideas, and checks the sample and replay", async () => {
    const recorded = await answerOf(await ideas(testDeps(), {}));
    expect(recorded).toMatchObject({ recorded: true, reason: "off", proposal: { fallback: true } });
    expect(recorded.proposal.items).toHaveLength(RECORDINGS.birthday.ideas.items.length);

    const failing = testDeps({ model: fakeModel({ json: [new Error("down")] }) });
    expect((await answerOf(await ideas(failing, {}))).recorded).toBe(true);
    expect(failing.logs).toContain("ai_failed");

    expect((await ideas(testDeps(), {}, undefined, "office")).status).toBe(404);
    expect((await ideas(testDeps(), { dismissedTitles: "x" })).status).toBe(400);
    expect((await ideas(testDeps(), { appliedOps: [{ type: "remove_task", taskId: "task-none" }] })).status).toBe(400);
  });
});

describe("demo daily cap", () => {
  it("counts in memory per day and refuses past the cap", async () => {
    const quota = new MemoryDemoQuota(2);
    expect([await quota.consume(TODAY), await quota.consume(TODAY), await quota.consume(TODAY)]).toEqual([true, true, false]);
    expect(await quota.consume("2026-10-29")).toBe(true);
  });

  it("counts in Firestore (meta/demoUsage) across instances, restarting each day", async () => {
    const db = new MemoryDb();
    const [a, b] = [new FirestoreDemoQuota(db, 2), new FirestoreDemoQuota(db, 2)];
    expect([await a.consume(TODAY), await b.consume(TODAY), await a.consume(TODAY)]).toEqual([true, true, false]);
    expect(await db.get(DEMO_USAGE_PATH)).toEqual({ day: TODAY, count: 2 });
    expect(await b.consume("2026-10-29")).toBe(true);
    expect(await db.get(DEMO_USAGE_PATH)).toEqual({ day: "2026-10-29", count: 1 });
  });

  it("treats an unreadable counter as unused, and picks the store by configuration", async () => {
    const db = new MemoryDb();
    db.docs.set(DEMO_USAGE_PATH, { day: 5 });
    expect(await new FirestoreDemoQuota(db).consume(TODAY)).toBe(true);
    expect(demoQuotaFor(db)).toBeInstanceOf(FirestoreDemoQuota);
    expect(demoQuotaFor(null)).toBeInstanceOf(MemoryDemoQuota);
    expect(DEMO_DAILY_CAP).toBe(300);
  });
});
