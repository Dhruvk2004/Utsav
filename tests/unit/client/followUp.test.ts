import { describe, expect, it } from "vitest";
import { adjustedLine, followUpDiff } from "@/lib/client/followUp";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { applyOk, wedding } from "../../domainFixtures";

const cut = (value: number, mode: "percent_change" | "set_amount" = "set_amount"): PlanOperation => ({
  type: "adjust_budget_category",
  lineId: "line-decor",
  mode,
  value,
  rebalance: "change_total",
});

describe("follow-up cards (design-system 6.5)", () => {
  const afterFirst = applyOk(wedding(), cut(-20, "percent_change"));

  it("titles the net effect from the original amount", () => {
    const diff = followUpDiff(afterFirst, applyOk(afterFirst, cut(255_000)), cut(255_000), 300_000);
    expect(diff?.title).toBe("Change Decor cut from 20% to 15%");
    expect(diff?.rows[0]).toMatchObject({
      label: "From original",
      before: "₹3,00,000",
      after: "₹2,55,000",
      delta: { text: "−15%", label: "15% less" },
    });
    expect(diff?.rows[1]).toMatchObject({ label: "From now", before: "₹2,40,000", delta: { text: "+₹15,000" } });
  });

  it("words a change past the original as signed percents", () => {
    const op = cut(330_000);
    expect(followUpDiff(afterFirst, applyOk(afterFirst, op), op, 300_000)?.title).toBe("Change Decor from −20% to +10% of the original");
  });

  it("is null for other ops, missing lines or a change that does not apply", () => {
    expect(adjustedLine({ type: "remove_task", taskId: "x" })).toBeNull();
    expect(followUpDiff(afterFirst, afterFirst, { type: "remove_task", taskId: "x" }, 1)).toBeNull();
    expect(followUpDiff(afterFirst, null, cut(1), 300_000)).toBeNull();
    expect(followUpDiff(afterFirst, afterFirst, { ...cut(1), lineId: "nope" } as PlanOperation, 0)).toBeNull();
  });
});
