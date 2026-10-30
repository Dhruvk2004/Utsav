import { describe, expect, it, vi } from "vitest";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Proposal } from "@/lib/domain/model/records";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import type { PlanStore } from "@/lib/plan/PlanStore";

/**
 * Behaviour every `PlanStore` must share (spec 5.10), so the workspace and the demo can use the
 * same components. Run against each implementation with a factory over the demo wedding.
 */

export const DECOR_CUT: PlanOperation = {
  type: "adjust_budget_category",
  lineId: "line-decor",
  mode: "percent_change",
  value: -20,
  rebalance: "change_total",
};

export function proposalOf(ops: PlanOperation[]): Proposal {
  return {
    touchpoint: "instruct",
    origin: "ai",
    instruction: "Cut decor spend by 20%",
    baseVersion: 1,
    items: ops.map((op, i) => ({ id: `i${i + 1}`, op, summary: `item ${i + 1}`, dependsOn: [], status: "pending", rationale: "" })),
    reply: null,
    model: "test",
    latencyMs: 0,
    fallback: false,
    createdAt: "2026-10-28T06:00:00.000Z",
    expireAt: "2026-10-29T06:00:00.000Z",
  };
}

const decor = (plan: EventDoc) => plan.budget.lines.find((line) => line.id === "line-decor")?.amount;

export function planStoreContract(name: string, makeStore: () => PlanStore): void {
  describe(`${name} (PlanStore contract)`, () => {
    it("accepts a card, notifies subscribers and undoes it", async () => {
      const store = makeStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      const result = await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
      expect(result.results[0]).toMatchObject({ ok: true, status: "accepted" });
      expect(decor(store.getPlan())).toBe(240_000);
      expect(listener).toHaveBeenCalledTimes(1);
      // One applied batch is one undo entry; the workspace's Undo buttons mirror this count.
      expect(store.undoDepth()).toBe(1);

      const undone = await store.undo();
      expect(undone.ok).toBe(true);
      expect(decor(store.getPlan())).toBe(300_000);
      expect(store.undoDepth()).toBe(0);
      unsubscribe();
      await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }]);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("leaves the plan unchanged when a card is declined", async () => {
      const store = makeStore();
      const before = store.getPlan();
      const result = await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "decline" }]);
      expect(result.proposal.items[0].status).toBe("declined");
      expect(store.getPlan()).toEqual(before);
      expect(store.undoDepth()).toBe(0);
    });

    it("reports when there is nothing to undo", async () => {
      expect(await makeStore().undo()).toMatchObject({ ok: false, reason: "Nothing to undo" });
    });
  });
}
