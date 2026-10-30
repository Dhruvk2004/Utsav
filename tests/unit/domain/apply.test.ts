import { describe, expect, it } from "vitest";
import { applyOperations, finalizePlan, validateOperation } from "@/lib/domain/ops/apply";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { AI, TODAY, USER, wedding } from "../../domainFixtures";

describe("applyOperations", () => {
  it("applies ops in order on a copy, skipping and reporting the ones a rule rejects", () => {
    const plan = wedding();
    const ops: PlanOperation[] = [
      { type: "set_budget_note", lineId: "line-decor", note: "First" },
      { type: "remove_task", taskId: "task-nope" },
      { type: "set_budget_note", lineId: "line-decor", note: "Second" },
    ];
    const outcome = applyOperations(plan, ops, USER);
    expect(outcome.results).toEqual([{ ok: true }, { ok: false, reason: "Task not found in this plan" }, { ok: true }]);
    expect(outcome.plan.budget.lines.find((l) => l.id === "line-decor")?.note).toBe("Second");
    expect(plan.budget.lines.find((l) => l.id === "line-decor")?.note).toBe("");
  });

  it("leaves no partial change behind when an op fails half-way", () => {
    const plan = wedding();
    const { plan: next } = applyOperations(
      plan,
      [{ type: "set_vendor_status", vendorId: "vendor-decorator", status: "paid", quotedAmount: 5 }],
      USER,
    );
    expect(next).toEqual(plan);
  });

  it("rejects manual-only ops that arrive through a proposal", () => {
    const op: PlanOperation = { type: "rename_function", functionId: "fn-sangeet", name: "Cocktails" };
    expect(validateOperation(wedding(), op, AI)).toEqual({ ok: false, reason: "This change can only be made by you" });
    expect(validateOperation(wedding(), op, USER)).toEqual({ ok: true });
  });

  it("rethrows programming errors instead of reporting them", () => {
    const broken = wedding();
    (broken as { functions: unknown }).functions = null;
    expect(() => applyOperations(broken, [{ type: "remove_function", functionId: "fn-sangeet" }], USER)).toThrow(TypeError);
  });
});

describe("finalizePlan", () => {
  it("re-derives percents, function amounts, guest flags, stats and warnings", () => {
    const plan = wedding();
    plan.budget.lines[0].percent = 99;
    plan.functions[0].amount = 1;
    plan.flags.kids = false;
    plan.stats.tasksDone = 0;
    plan.warnings = [];
    plan.stats.pending = { count: 2, expireAt: "2026-10-29T00:00:00.000Z" };
    const next = finalizePlan(plan, TODAY);
    expect(next.budget.lines[0].percent).toBe(20);
    expect(next.functions[0].amount).toBe(250_000);
    expect(next.flags.kids).toBe(true);
    expect(next.stats.tasksDone).toBe(12);
    expect(next.stats.pending.count).toBe(2);
    expect(next.warnings.length).toBeGreaterThan(0);
  });
});
