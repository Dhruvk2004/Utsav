import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/lib/domain/budget";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations } from "@/lib/domain/ops/apply";
import { AI, applyOk, lineAmount, rejectReason, USER, wedding } from "../../domainFixtures";

const decorCut = { type: "adjust_budget_category", lineId: "line-decor", mode: "percent_change", value: -20 } as const;

describe("set_total_budget", () => {
  it("rescales every line in proportion and re-derives function amounts", () => {
    const plan = applyOk(wedding(), { type: "set_total_budget", total: 2_000_000, strategy: "rescale" });
    expect(plan.budget.total).toBe(2_000_000);
    expect(lineAmount(plan, "line-decor")).toBe(240_000);
    expect(plan.functions.find((f) => f.id === "fn-wedding")?.amount).toBe(900_000);
    expect(plan.budget.lines.find((l) => l.id === "line-decor")?.percent).toBe(12);
  });
});

describe("set_budget_lines", () => {
  const rows = (plan: EventDoc, change: Record<string, number> = {}) =>
    plan.budget.lines.map((line) => ({ lineId: line.id, amount: change[line.id] ?? line.amount }));

  it("sets every amount and makes their sum the new total", () => {
    const plan = wedding();
    const next = applyOk(plan, { type: "set_budget_lines", lines: rows(plan, { "line-decor": 200_000 }) });
    expect(next.budget.total).toBe(2_400_000);
    expect(sumAmounts(next.functions)).toBe(2_400_000);
  });

  it("updates notes and marks a changed note as the actor's", () => {
    const plan = wedding();
    const lines = rows(plan).map((row) => (row.lineId === "line-decor" ? { ...row, note: "Fewer flowers" } : row));
    const next = applyOk(plan, { type: "set_budget_lines", lines }, AI);
    expect(next.budget.lines.find((l) => l.id === "line-decor")).toMatchObject({ note: "Fewer flowers", origin: "ai" });
    expect(next.budget.lines.find((l) => l.id === "line-venue")?.origin).toBe("ai");
  });

  it.each([
    ["a missing line", (plan: EventDoc) => rows(plan).slice(1)],
    ["an extra line", (plan: EventDoc) => [...rows(plan), { lineId: "line-fireworks", amount: 1 }]],
    ["an unknown line", (plan: EventDoc) => [...rows(plan).slice(1), { lineId: "line-fireworks", amount: 1 }]],
    ["a duplicated line", (plan: EventDoc) => [...rows(plan).slice(1), rows(plan)[1]]],
  ])("rejects %s", (_, build) => {
    const plan = wedding();
    expect(rejectReason(plan, { type: "set_budget_lines", lines: build(plan) })).toMatch(/exactly the plan's current categories/);
  });

  it("rejects a total below the minimum budget", () => {
    const plan = wedding();
    const lines = rows(plan).map((row) => ({ ...row, amount: 0 }));
    expect(rejectReason(plan, { type: "set_budget_lines", lines })).toMatch(/can't go below ₹1,000/);
  });
});

describe("adjust_budget_category", () => {
  it("cuts decor by 20% and changes the total (the demo's first instruction)", () => {
    const plan = applyOk(wedding(), { ...decorCut, rebalance: "change_total" }, AI);
    expect(lineAmount(plan, "line-decor")).toBe(240_000);
    expect(plan.budget.total).toBe(2_440_000);
    expect(lineAmount(plan, "line-photography")).toBe(200_000);
    expect(sumAmounts(plan.functions)).toBe(2_440_000);
  });

  it("spreads the difference over the other lines, keeping the total (design state S2)", () => {
    const plan = applyOk(wedding(), {
      type: "adjust_budget_category",
      lineId: "line-decor",
      mode: "set_amount",
      value: 190_000,
      rebalance: "spread_to_others",
    });
    expect(plan.budget.total).toBe(2_500_000);
    expect(lineAmount(plan, "line-photography")).toBe(210_000);
    expect(lineAmount(plan, "line-venue")).toBe(525_000);
  });

  it("moves the difference into Contingency", () => {
    const plan = applyOk(wedding(), {
      type: "adjust_budget_category",
      lineId: "line-decor",
      mode: "change_amount",
      value: 50_000,
      rebalance: "to_contingency",
    });
    expect(lineAmount(plan, "line-decor")).toBe(350_000);
    expect(lineAmount(plan, "line-contingency")).toBe(100_000);
  });

  it.each([
    [{ mode: "change_amount", value: -400_000, rebalance: "change_total" }, /can't go below ₹0/],
    [{ mode: "set_amount", value: 100.5, rebalance: "change_total" }, /whole rupees/],
    [{ mode: "set_amount", value: 99_000_000, rebalance: "change_total" }, /too large/],
    [{ mode: "change_amount", value: 200_000, rebalance: "to_contingency" }, /Contingency has only ₹1,50,000/],
    [{ mode: "set_amount", value: 3_000_000, rebalance: "spread_to_others" }, /other categories can't cover/],
  ] as const)("rejects %o", (fields, reason) => {
    expect(rejectReason(wedding(), { type: "adjust_budget_category", lineId: "line-decor", ...fields })).toMatch(reason);
  });

  it("rejects balancing Contingency against itself and unknown lines", () => {
    const op = { type: "adjust_budget_category", mode: "change_amount", value: 1, rebalance: "to_contingency" } as const;
    expect(rejectReason(wedding(), { ...op, lineId: "line-contingency" })).toMatch(/another way/);
    expect(rejectReason(wedding(), { ...op, lineId: "line-fireworks" })).toMatch(/not found/);
  });
});

describe("add_budget_category", () => {
  const add = { type: "add_budget_category", category: "Fireworks", amount: 50_000 } as const;

  it("funds a new line from Contingency", () => {
    const plan = applyOk(wedding(), { ...add, fundFrom: "contingency" });
    expect(lineAmount(plan, "line-fireworks")).toBe(50_000);
    expect(lineAmount(plan, "line-contingency")).toBe(100_000);
    expect(plan.budget.lines.at(-1)?.origin).toBe("user");
  });

  it("funds a new line by trimming the others", () => {
    const plan = applyOk(wedding(), { ...add, fundFrom: "spread" });
    expect(plan.budget.total).toBe(2_500_000);
    expect(lineAmount(plan, "line-fireworks")).toBe(50_000);
    expect(lineAmount(plan, "line-venue")).toBe(490_000);
  });

  it("funds a new line by raising the total", () => {
    const plan = applyOk(wedding(), { ...add, fundFrom: "increase_total" });
    expect(plan.budget.total).toBe(2_550_000);
    expect(sumAmounts(plan.functions)).toBe(2_550_000);
  });

  it("rejects duplicates, overdrawn sources and too many lines", () => {
    expect(rejectReason(wedding(), { ...add, category: " decor ", fundFrom: "spread" })).toMatch(/already a category/);
    expect(rejectReason(wedding(), { ...add, amount: 200_000, fundFrom: "contingency" })).toMatch(/Contingency has only/);
    expect(rejectReason(wedding(), { ...add, amount: 3_000_000, fundFrom: "spread" })).toMatch(/can't cover this amount/);
    let plan = wedding();
    for (let i = plan.budget.lines.length; i < 20; i++) {
      plan = applyOk(plan, { ...add, category: `Extra ${i}`, amount: 0, fundFrom: "spread" });
    }
    expect(rejectReason(plan, { ...add, fundFrom: "spread" })).toMatch(/at most 20 categories/);
  });

  it("rejects funding from Contingency when the plan has none", () => {
    // Such a plan breaks invariant 2, so it is built by hand and applied without the checked helper.
    const plan = wedding();
    plan.budget.lines = plan.budget.lines.filter((line) => line.id !== "line-contingency");
    plan.budget.total -= 150_000;
    const { results } = applyOperations(plan, [{ ...add, fundFrom: "contingency" }], USER);
    expect(results[0]).toEqual({ ok: false, reason: "This plan has no Contingency line" });
  });
});

describe("rename_budget_category", () => {
  it("renames a line and marks it as the user's", () => {
    const plan = applyOk(wedding(), { type: "rename_budget_category", lineId: "line-decor", category: "Flowers & decor" });
    expect(plan.budget.lines.find((l) => l.id === "line-decor")).toMatchObject({ category: "Flowers & decor", origin: "user" });
  });

  it("keeps the same name with different case, but rejects another line's name and Contingency", () => {
    applyOk(wedding(), { type: "rename_budget_category", lineId: "line-decor", category: "DECOR" });
    expect(rejectReason(wedding(), { type: "rename_budget_category", lineId: "line-decor", category: "venue" })).toMatch(
      /already a category/,
    );
    expect(rejectReason(wedding(), { type: "rename_budget_category", lineId: "line-contingency", category: "Buffer" })).toMatch(
      /can't be renamed/,
    );
  });
});

describe("remove_budget_category", () => {
  it("moves the amount and linked vendors to Contingency by default", () => {
    const plan = applyOk(wedding(), { type: "remove_budget_category", lineId: "line-photography" });
    expect(lineAmount(plan, "line-contingency")).toBe(350_000);
    expect(plan.vendors.filter((v) => v.budgetLineId === "line-contingency").map((v) => v.category)).toEqual([
      "Videographer",
      "Photographer",
    ]);
  });

  it("moves them to the chosen line", () => {
    const plan = applyOk(wedding(), { type: "remove_budget_category", lineId: "line-photography", moveToLineId: "line-decor" });
    expect(lineAmount(plan, "line-decor")).toBe(500_000);
    expect(plan.vendors.find((v) => v.id === "vendor-videographer")?.budgetLineId).toBe("line-decor");
  });

  it("refuses to remove Contingency or to move a line into itself", () => {
    expect(rejectReason(wedding(), { type: "remove_budget_category", lineId: "line-contingency" })).toMatch(/can't be removed/);
    expect(rejectReason(wedding(), { type: "remove_budget_category", lineId: "line-decor", moveToLineId: "line-decor" })).toMatch(
      /different category/,
    );
  });
});

describe("set_budget_note", () => {
  it("sets the note with provenance from the context", () => {
    const plan = applyOk(wedding(), { type: "set_budget_note", lineId: "line-venue", note: "Includes lawns" }, AI);
    expect(plan.budget.lines[0]).toMatchObject({ note: "Includes lawns", origin: "ai" });
  });
});
