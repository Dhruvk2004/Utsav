import { describe, expect, it } from "vitest";
import { adjustedIds, announceChange } from "@/lib/domain/announce";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { applyOk, birthday, TODAY, wedding } from "../../domainFixtures";

const say = (op: PlanOperation, plan = wedding()) => announceChange(plan, applyOk(plan, op), op, TODAY);

describe("announceChange (spec 5.4, 9.2)", () => {
  it("names the edited row and the rows that rebalanced, keeping the total", () => {
    expect(
      say({ type: "adjust_budget_category", lineId: "line-decor", mode: "set_amount", value: 190_000, rebalance: "spread_to_others" }),
    ).toBe("Saved. Decor set to ₹1,90,000. Venue and 7 other categories adjusted; total unchanged at ₹25,00,000.");
  });

  it("says the new total, and that function amounts follow, when the total changes", () => {
    expect(
      say({ type: "adjust_budget_category", lineId: "line-decor", mode: "set_amount", value: 250_000, rebalance: "change_total" }),
    ).toBe("Saved. Decor set to ₹2,50,000. Total is now ₹24,50,000; function amounts updated.");
    expect(
      say(
        { type: "adjust_budget_category", lineId: "line-decor", mode: "change_amount", value: -1_000, rebalance: "change_total" },
        birthday(),
      ),
    ).toBe("Saved. Decor set to ₹8,000. Total is now ₹59,000.");
  });

  it("names one moved row on its own", () => {
    expect(
      say(
        { type: "adjust_budget_category", lineId: "line-decor", mode: "change_amount", value: 1_000, rebalance: "to_contingency" },
        birthday(),
      ),
    ).toBe("Saved. Decor set to ₹10,000. Contingency adjusted; total unchanged at ₹60,000.");
  });

  it("announces function shares", () => {
    expect(say({ type: "set_function_share", functionId: "fn-sangeet", percent: 20 })).toBe(
      "Saved. Sangeet share set to 20% (₹5,00,000). Haldi and 3 other functions adjusted; shares total 100%.",
    );
  });

  it("falls back to the card title, and is empty for a target that is gone", () => {
    expect(say({ type: "remove_task", taskId: "task-book-decorator" })).toBe("Saved. Remove task: Book decorator.");
    const plan = wedding();
    expect(
      announceChange(
        plan,
        plan,
        { type: "adjust_budget_category", lineId: "nope", mode: "set_amount", value: 1, rebalance: "change_total" },
        TODAY,
      ),
    ).toBe("Saved.");
    expect(announceChange(plan, plan, { type: "set_function_share", functionId: "nope", percent: 1 }, TODAY)).toBe("Saved.");
    expect(adjustedIds(plan, plan, "line-decor")).toEqual([]);
  });
});
