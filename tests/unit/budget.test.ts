import { describe, expect, it } from "vitest";
import {
  allocate,
  buildBudgetLines,
  diffBudgets,
  formatInr,
  mergeCategories,
  percentOf,
  rebalancePinned,
  rescaleBudget,
  sumAmounts,
} from "@/lib/domain/budget";

describe("allocate", () => {
  it("splits a total proportionally to the weights", () => {
    expect(allocate(1000, [50, 30, 20])).toEqual([500, 300, 200]);
  });

  it("always sums to exactly the total, even with awkward fractions", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(sumAmounts(parts.map((amount) => ({ amount })))).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("normalises weights that do not add up to 100", () => {
    expect(allocate(900, [10, 20])).toEqual([300, 600]);
  });

  it("gives the leftover rupee to the largest fractional share", () => {
    expect(allocate(10, [1, 2])).toEqual([3, 7]);
  });

  it("splits evenly when every weight is zero", () => {
    expect(allocate(9, [0, 0, 0])).toEqual([3, 3, 3]);
  });

  it("treats negative and non-finite weights as zero", () => {
    expect(allocate(100, [-5, Number.NaN, 1])).toEqual([0, 0, 100]);
  });

  it("returns an empty list for no weights", () => {
    expect(allocate(500, [])).toEqual([]);
  });

  it("handles a zero total", () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });

  it("rejects negative or fractional totals", () => {
    expect(() => allocate(-1, [1])).toThrow(RangeError);
    expect(() => allocate(10.5, [1])).toThrow(RangeError);
  });

  it("keeps the sum exact for large budgets", () => {
    const parts = allocate(98_765_431, [12.5, 33.3, 7.1, 47.1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(98_765_431);
  });
});

describe("percentOf", () => {
  it("rounds to one decimal place", () => {
    expect(percentOf(1, 3)).toBe(33.3);
  });

  it("returns 0 for a non-positive total", () => {
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe("mergeCategories", () => {
  it("merges duplicates case-insensitively and joins notes", () => {
    const merged = mergeCategories([
      { category: "Decor", percent: 10, note: "flowers" },
      { category: " decor ", percent: 5, note: "lights" },
      { category: "Venue", percent: 20, note: "" },
    ]);
    expect(merged).toEqual([
      { category: "Decor", percent: 15, note: "flowers; lights" },
      { category: "Venue", percent: 20, note: "" },
    ]);
  });
});

describe("buildBudgetLines", () => {
  it("turns AI percentages into rupee amounts that add up to the budget", () => {
    const lines = buildBudgetLines(500_000, [
      { category: "Venue", percent: 40, note: "" },
      { category: "Food", percent: 45, note: "" },
      { category: "Decor", percent: 20, note: "" },
    ]);
    expect(sumAmounts(lines)).toBe(500_000);
    expect(lines.map((l) => l.category)).toEqual(["Venue", "Food", "Decor"]);
    expect(lines[0].percent).toBeCloseTo(38.1, 1);
  });
});

describe("rescaleBudget", () => {
  it("keeps proportions and hits the new total exactly", () => {
    const lines = buildBudgetLines(100_000, [
      { category: "A", percent: 60, note: "" },
      { category: "B", percent: 40, note: "" },
    ]);
    const scaled = rescaleBudget(lines, 80_001);
    expect(sumAmounts(scaled)).toBe(80_001);
    expect(scaled[0].percent).toBe(60);
  });
});

describe("diffBudgets", () => {
  const before = [
    { category: "Venue", amount: 100, percent: 50, note: "" },
    { category: "Band", amount: 100, percent: 50, note: "" },
  ];

  it("reports changed, added and removed categories", () => {
    const after = [
      { category: "venue", amount: 80, percent: 80, note: "" },
      { category: "DJ", amount: 20, percent: 20, note: "" },
    ];
    expect(diffBudgets(before, after)).toEqual([
      { category: "venue", before: 100, after: 80, delta: -20, status: "changed" },
      { category: "DJ", before: 0, after: 20, delta: 20, status: "added" },
      { category: "Band", before: 100, after: 0, delta: -100, status: "removed" },
    ]);
  });

  it("marks identical lines as unchanged", () => {
    expect(diffBudgets(before, before).every((c) => c.status === "unchanged")).toBe(true);
  });
});

describe("formatInr", () => {
  it("uses Indian digit grouping without decimals", () => {
    expect(formatInr(1_500_000)).toBe("₹15,00,000");
  });
});

describe("rebalancePinned", () => {
  const rows = [
    { id: "a", amount: 300 },
    { id: "b", amount: 200 },
    { id: "c", amount: 500 },
  ];

  it("pins rows and spreads the rest in proportion, keeping the total exact", () => {
    expect(rebalancePinned(rows, { a: 190 }, 1000)?.map((r) => r.amount)).toEqual([190, 231, 579]);
    expect(rebalancePinned(rows, { a: 100, b: 100 }, 1000)?.map((r) => r.amount)).toEqual([100, 100, 800]);
  });

  it("splits evenly when the free rows are all zero", () => {
    expect(
      rebalancePinned(
        [
          { id: "a", amount: 0 },
          { id: "b", amount: 0 },
          { id: "p", amount: 9 },
        ],
        { p: 1 },
        5,
      )?.map((r) => r.amount),
    ).toEqual([2, 2, 1]);
  });

  it("returns null when the pins cannot fit the total", () => {
    expect(rebalancePinned(rows, { a: 1200 }, 1000)).toBeNull();
    expect(rebalancePinned(rows, { a: 300, b: 200, c: 400 }, 1000)).toBeNull();
    expect(rebalancePinned(rows, { a: 300, b: 200, c: 500 }, 1000)).toEqual(rows);
  });
});
