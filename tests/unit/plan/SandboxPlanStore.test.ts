import { describe, expect, it } from "vitest";
import { demoFixture } from "@/lib/demo/fixtures";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { SANDBOX_MAX_OPS, SandboxPlanStore } from "@/lib/plan/SandboxPlanStore";
import { DECOR_CUT, planStoreContract, proposalOf } from "../../contracts/planStoreContract";

const TODAY = "2026-10-28";
const pristine = () => demoFixture("wedding", TODAY).event;
const makeStore = () => new SandboxPlanStore(pristine(), TODAY);
const DECOR_CUT_OP = DECOR_CUT as Extract<PlanOperation, { type: "adjust_budget_category" }>;
const note = (text: string): PlanOperation => ({ type: "set_budget_note", lineId: "line-venue", note: text });

planStoreContract("SandboxPlanStore", makeStore);

describe("SandboxPlanStore", () => {
  it("is a sandbox", () => {
    expect(makeStore().mode).toBe("sandbox");
  });

  it("keeps accepted ops so the server can replay them onto the pristine fixture", async () => {
    const store = makeStore();
    await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
    const followUp: PlanOperation = { ...DECOR_CUT_OP, mode: "set_amount", value: 255_000 };
    const second = await store.decide(proposalOf([followUp]), [{ itemId: "i1", action: "accept" }]);
    expect(second.results[0].ok).toBe(true);
    expect(store.appliedOps).toEqual([DECOR_CUT, followUp]);

    const replay = applyOperations(pristine(), [...store.appliedOps], { today: TODAY, actor: "user" });
    expect(replay.results.every((r) => r.ok)).toBe(true);
    expect(replay.plan.budget).toEqual(store.getPlan().budget);
  });

  it('marks the ops decided on an "instead" answer, and Undo and reset drop the marks (MQR-02 d)', async () => {
    const store = makeStore();
    await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
    const followUp: PlanOperation = { ...DECOR_CUT_OP, mode: "set_amount", value: 255_000 };
    await store.decide({ ...proposalOf([followUp]), instruction: "make that 15% instead" }, [{ itemId: "i1", action: "accept" }]);
    await store.applyManual([note("Lawns included")]);
    expect(store.replacingOps).toEqual([1]);
    await store.undo();
    await store.undo();
    expect(store.replacingOps).toEqual([]);
    await store.decide({ ...proposalOf([followUp]), instruction: "Make it ₹2,55,000 instead" }, [{ itemId: "i1", action: "accept" }]);
    expect(store.replacingOps).toEqual([1]);
    store.reset();
    expect(store.replacingOps).toEqual([]);
  });

  it("applies manual proposable ops all or nothing", async () => {
    const store = makeStore();
    const ok = await store.applyManual([note("Lawns included")]);
    expect(ok.ok).toBe(true);
    expect(store.appliedOps).toHaveLength(1);

    const failed = await store.applyManual([note("Second"), { type: "remove_task", taskId: "task-x" }]);
    expect(failed).toMatchObject({ ok: false, reason: "Task not found in this plan" });
    expect(store.getPlan().budget.lines[0].note).toBe("Lawns included");
  });

  it("refuses manual-only ops the server could not replay", async () => {
    const result = await makeStore().applyManual([{ type: "set_summary", text: "Ours" }]);
    expect(result).toMatchObject({ ok: false, reason: "Sample plans change only through suggestions" });
  });

  it("stops at the replay limit", async () => {
    const store = makeStore();
    for (let i = 0; i < SANDBOX_MAX_OPS; i++) expect((await store.applyManual([note(`n${i}`)])).ok).toBe(true);
    expect(await store.applyManual([note("one more")])).toMatchObject({ ok: false, reason: expect.stringMatching(/up to 20 changes/) });
    const decided = await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
    expect(decided.results[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/Reset it/) });
    expect(decided.proposal.items[0].status).toBe("pending");
  });

  it("undoes batches in order, trimming appliedOps", async () => {
    const store = makeStore();
    await store.applyManual([note("a")]);
    await store.applyManual([note("b"), note("c")]);
    await store.undo();
    expect(store.appliedOps).toEqual([note("a")]);
    expect(store.getPlan().budget.lines[0].note).toBe("a");
  });

  it("keeps the last four turns and resets to the pristine sample", async () => {
    const store = makeStore();
    for (let i = 1; i <= 5; i++) store.recordTurn({ instruction: `turn ${i}`, items: [] });
    expect(store.previousTurns.map((t) => t.instruction)).toEqual(["turn 2", "turn 3", "turn 4", "turn 5"]);
    await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
    store.reset();
    expect(store.getPlan()).toEqual(pristine());
    expect(store.appliedOps).toEqual([]);
    expect(store.previousTurns).toEqual([]);
    expect((await store.undo()).ok).toBe(false);
  });
});
