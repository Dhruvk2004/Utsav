import { describe, expect, it } from "vitest";
import type { HistoryDoc } from "@/lib/domain/model/records";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import type { ProposalDraft } from "@/lib/plan/proposals";
import { replaceEarlierChanges, replacesEarlier, stepsFromHistory, stepsFromOps, type LineStep } from "@/lib/plan/replaceEarlier";
import { TODAY, wedding } from "../../domainFixtures";

/** "Make that 15% instead" replaces the earlier change instead of stacking on it (MQW-06, MQR-02). */

const decorAt = (amount: number) => {
  const plan = wedding();
  plan.budget.lines.find((line) => line.id === "line-decor")!.amount = amount;
  return plan;
};
const adjust = (mode: "percent_change" | "change_amount" | "set_amount", value: number): PlanOperation => ({
  type: "adjust_budget_category",
  lineId: "line-decor",
  mode,
  value,
  rebalance: "change_total",
});
const draft = (instruction: string, ...ops: PlanOperation[]): ProposalDraft => ({
  touchpoint: "instruct",
  origin: "ai",
  instruction,
  items: ops.map((op) => ({ op })),
});
const step = (before: number, after: number, replaces = false): LineStep => ({ lineId: "line-decor", before, after, replaces });

describe("replaceEarlierChanges", () => {
  it("re-measures a percent follow-up from the amount before an earlier percent cut", () => {
    // ₹1,80,000 cut by 25% is ₹1,35,000; "make that 15% instead" is ₹1,53,000, not ₹1,14,750.
    const out = replaceEarlierChanges(draft("make that 15% instead", adjust("percent_change", -15)), decorAt(135_000), [
      step(180_000, 135_000),
    ]);
    expect(out.items[0].op).toEqual(adjust("set_amount", 153_000));
  });

  it("handles amount changes, and the latest earlier change wins", () => {
    const earlier = [step(600_000, 300_000), step(300_000, 260_000)];
    const out = replaceEarlierChanges(draft("Instead, cut it by ₹10,000", adjust("change_amount", -10_000)), decorAt(260_000), earlier);
    expect(out.items[0].op).toEqual(adjust("set_amount", 290_000));
    const percent = replaceEarlierChanges(draft("make it 10% instead", adjust("percent_change", -10)), decorAt(260_000), earlier);
    expect(percent.items[0].op).toEqual(adjust("set_amount", 270_000));
  });

  it("does nothing once the earlier change is undone or the line was edited since (MQR-02)", () => {
    // ₹3,60,000 cut by 20% to ₹2,88,000, then undone: a 15% cut is from ₹3,60,000, never ₹3,82,500.
    const follow = draft("make that 15% instead", adjust("percent_change", -15));
    expect(replaceEarlierChanges(follow, decorAt(360_000), [step(360_000, 288_000)]).items[0].op).toEqual(adjust("percent_change", -15));
    // Edited by hand to ₹2,00,000 after the cut.
    expect(replaceEarlierChanges(follow, decorAt(200_000), [step(360_000, 288_000)]).items[0].op).toEqual(adjust("percent_change", -15));
  });

  it("measures a second 'instead' from the same original amount (MQR-02)", () => {
    // ₹3,60,000 -20% = ₹2,88,000, then "15% instead" set ₹3,06,000; "10% instead" is ₹3,24,000.
    const earlier = [step(360_000, 288_000), step(288_000, 306_000, true)];
    const out = replaceEarlierChanges(draft("make that 10% instead", adjust("percent_change", -10)), decorAt(306_000), earlier);
    expect(out.items[0].op).toEqual(adjust("set_amount", 324_000));
    // A further change that did not replace anything starts a new base.
    const fresh = [step(360_000, 288_000), step(288_000, 306_000)];
    expect(
      replaceEarlierChanges(draft("make that 10% instead", adjust("percent_change", -10)), decorAt(306_000), fresh).items[0].op,
    ).toEqual(adjust("set_amount", 259_200));
  });

  it("leaves everything else alone", () => {
    const plan = decorAt(240_000);
    const earlier = [step(300_000, 240_000)];
    const fresh = draft("cut decor by 15%", adjust("percent_change", -15));
    expect(replaceEarlierChanges(fresh, plan, earlier)).toBe(fresh);
    const nothingEarlier = draft("make that 15% instead", adjust("percent_change", -15));
    expect(replaceEarlierChanges(nothingEarlier, plan, [])).toBe(nothingEarlier);
    const absolute = draft("make that 2.5 lakh instead", adjust("set_amount", 250_000), {
      type: "add_task",
      title: "Call the decorator",
      category: "Decor",
      daysBefore: 10,
    });
    expect(replaceEarlierChanges(absolute, plan, earlier).items.map((item) => item.op)).toEqual(absolute.items.map((item) => item.op));
    // A change that would go below zero is left for validation to refuse.
    expect(
      replaceEarlierChanges(draft("make that minus 5 lakh instead", adjust("change_amount", -500_000)), plan, earlier).items[0].op,
    ).toEqual(adjust("change_amount", -500_000));
    const otherLine = draft("make that 15% instead", { ...adjust("percent_change", -15), lineId: "line-venue" } as PlanOperation);
    expect(replaceEarlierChanges(otherLine, plan, earlier).items[0].op).toMatchObject({ lineId: "line-venue", mode: "percent_change" });
  });

  it("is triggered by 'instead' and 'make it/that', never by 'rather' or 'instead of' (MQR-02)", () => {
    expect(replacesEarlier("make that 15% instead")).toBe(true);
    expect(replacesEarlier("Make it 2 lakh")).toBe(true);
    expect(replacesEarlier("change that to 10%")).toBe(true);
    expect(replacesEarlier("Cut decor spend by 20% again, rather than touching catering")).toBe(false);
    expect(replacesEarlier("Cut decor by 10% instead of catering")).toBe(false);
    const again = draft("Cut decor spend by 20% again, rather than touching catering", adjust("percent_change", -20));
    expect(replaceEarlierChanges(again, decorAt(288_000), [step(360_000, 288_000)])).toBe(again);
  });
});

const NOW = "2026-10-29T10:00:00.000Z";
function entry(versionBefore: number, extra: Partial<HistoryDoc>): HistoryDoc {
  return {
    actor: "user_via_ai",
    label: "Change",
    ops: [],
    before: {},
    versionBefore,
    versionAfter: versionBefore + 1,
    createdAt: NOW,
    expireAt: NOW,
    ...extra,
  };
}
const budgetWithDecor = (amount: number) => ({ budget: decorAt(amount).budget });

describe("stepsFromHistory", () => {
  const cut = entry(1, { ops: [adjust("percent_change", -20)], before: budgetWithDecor(360_000), proposalId: "p1" });

  it("reads the amounts from the history entry, in version order", () => {
    const followUp = entry(2, { ops: [adjust("set_amount", 306_000)], before: budgetWithDecor(288_000), proposalId: "p2" });
    expect(stepsFromHistory([followUp, cut], new Set(["p2"]))).toEqual([step(360_000, 288_000), step(288_000, 306_000, true)]);
  });

  it("skips undone AI changes, unless the undo was undone, and anything not from AI", () => {
    const undo = entry(2, { actor: "user", label: "Undo: Reduce Decor by 20%", before: budgetWithDecor(288_000) });
    expect(stepsFromHistory([cut, undo], new Set())).toEqual([]);
    const redo = entry(3, { actor: "user", label: "Undo: Undo: Reduce Decor by 20%", before: budgetWithDecor(360_000) });
    expect(stepsFromHistory([cut, undo, redo], new Set())).toEqual([step(360_000, 288_000)]);
    const manual = entry(1, { actor: "user", ops: [adjust("set_amount", 200_000)], before: budgetWithDecor(360_000) });
    const noBudget = entry(4, { ops: [adjust("percent_change", -10)] });
    const unknownLine = entry(5, {
      ops: [{ ...adjust("percent_change", -10), lineId: "line-none" } as PlanOperation],
      before: budgetWithDecor(1),
    });
    const other = entry(6, {
      ops: [{ type: "add_task", title: "Call the decorator", category: "Decor", daysBefore: 10 }],
      before: budgetWithDecor(1),
    });
    expect(stepsFromHistory([manual, noBudget, unknownLine, other], new Set())).toEqual([]);
  });
});

describe("stepsFromOps", () => {
  it("replays the demo's accepted ops one at a time", () => {
    const start = wedding();
    const decor = start.budget.lines.find((line) => line.id === "line-decor")!.amount;
    const ops = [
      adjust("percent_change", -20),
      { type: "add_task", title: "Call the decorator", category: "Decor", daysBefore: 10 } as PlanOperation,
      adjust("change_amount", -10_000),
    ];
    expect(stepsFromOps(start, ops, TODAY)).toEqual([step(decor, decor * 0.8), step(decor * 0.8, decor * 0.8 - 10_000)]);
  });

  it('marks the ops decided on an "instead" answer, so a second "instead" keeps the original amount (MQR-02 d)', () => {
    const start = wedding();
    const decor = start.budget.lines.find((line) => line.id === "line-decor")!.amount;
    // 20% cut, then "make that 15% instead" rewritten to a set amount, then "make it 10% instead".
    const ops = [adjust("percent_change", -20), adjust("set_amount", decor * 0.85)];
    const steps = stepsFromOps(start, ops, TODAY, new Set([1]));
    expect(steps.map((s) => s.replaces)).toEqual([false, true]);
    const plan = applyOperations(start, ops, { today: TODAY, actor: "user" }).plan;
    const again = draft("No, make it 10% instead", adjust("percent_change", -10));
    expect(replaceEarlierChanges(again, plan, steps).items[0].op).toMatchObject({ mode: "set_amount", value: decor * 0.9 });
    // Without the mark, the rewrite counts as a fresh change and the cut stacks (the bug).
    const stacked = replaceEarlierChanges(again, plan, stepsFromOps(start, ops, TODAY));
    expect(stacked.items[0].op).toMatchObject({ mode: "set_amount", value: decor * 0.8 * 0.9 });
  });
});
