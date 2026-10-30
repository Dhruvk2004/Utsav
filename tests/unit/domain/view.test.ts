import { describe, expect, it } from "vitest";
import { moneyByLine, moneyOf } from "@/lib/domain/money";
import type { VendorDoc } from "@/lib/domain/model/event";
import { computeStats, idealDueDate } from "@/lib/domain/stats";
import { deriveView } from "@/lib/domain/view";
import { birthday, TODAY, wedding } from "../../domainFixtures";

function vendor(status: VendorDoc["status"], quotedAmount: number | null, paidAmount: number, budgetLineId: string | null = null) {
  return { status, quotedAmount, paidAmount, budgetLineId } as VendorDoc;
}

describe("money definitions", () => {
  it("matches design state S1 for the demo wedding", () => {
    expect(moneyOf(wedding())).toEqual({
      allocated: 2_500_000,
      committed: 1_118_000,
      paid: 240_000,
      quotedOpen: 45_000,
      remaining: 1_382_000,
    });
    expect(moneyByLine(wedding()).get("line-photography")).toMatchObject({ allocated: 200_000, committed: 240_000, remaining: -40_000 });
  });

  it("counts committed from booked and paid, paid from any status, quotedOpen from quoted, ignoring not needed", () => {
    const money = moneyOf({
      budget: { total: 100_000, lines: [] },
      vendors: [
        vendor("booked", 30_000, 5_000),
        vendor("paid", 10_000, 12_000),
        vendor("quoted", 8_000, 0),
        vendor("contacted", null, 2_000),
        vendor("not_needed", 50_000, 0),
      ],
    });
    expect(money).toEqual({ allocated: 100_000, committed: 40_000, paid: 19_000, quotedOpen: 8_000, remaining: 60_000 });
  });
});

describe("computeStats", () => {
  it("counts tasks and vendors and lists open ideal due dates in order", () => {
    const stats = computeStats(wedding());
    expect(stats).toMatchObject({ tasksDone: 12, tasksTotal: 34, committed: 1_118_000 });
    expect(stats.vendorsByStatus).toEqual({ to_research: 3, contacted: 2, quoted: 1, booked: 3, paid: 1, not_needed: 1 });
    expect(stats.openDueDates).toHaveLength(22);
    expect(stats.openDueDates[0]).toBe("2026-10-13");
    expect(stats.openDueDates.at(-1)).toBe("2027-01-03");
  });

  it("uses a task's pin as its due date", () => {
    expect(idealDueDate({ pinnedDate: "2026-11-01", daysBefore: 3 }, "2026-12-01")).toBe("2026-11-01");
    expect(idealDueDate({ pinnedDate: null, daysBefore: -2 }, "2026-12-01")).toBe("2026-12-03");
  });
});

describe("deriveView", () => {
  const view = deriveView(wedding(), TODAY);

  it("counts down to the event and finds a nearby festival", () => {
    expect(view.daysToGo).toBe(60);
    expect(view.festival).toMatchObject({ festival: "christmas", daysAway: -2 });
  });

  it("pulls late tasks forward to today and flags the open ones overdue", () => {
    const makeup = view.tasks.find((t) => t.id === "task-book-makeup-artist");
    expect(makeup).toMatchObject({ dueDate: TODAY, rushed: true, overdue: true, phaseId: "months" });
    const venue = view.tasks.find((t) => t.id === "task-book-wedding-venue");
    expect(venue).toMatchObject({ rushed: true, overdue: false });
    expect(view.tasks.filter((t) => t.overdue)).toHaveLength(1);
  });

  it("puts post-event tasks in the After the event phase, and reception tasks on the reception day", () => {
    const after = view.tasks.filter((t) => t.phaseId === "after").map((t) => [t.title, t.dueDate]);
    expect(after).toContainEqual(["Send thank-you messages", "2027-01-01"]);
    expect(after).toContainEqual(["Brief the reception emcee", "2026-12-28"]);
    expect(view.tasks.at(-1)?.dueDate).toBe("2027-01-03");
  });

  it("flags vendors still unbooked after their book-by date", () => {
    expect(view.vendors.find((v) => v.id === "vendor-makeup-artist")).toMatchObject({ bookBy: TODAY, rushed: true });
    expect(view.vendors.find((v) => v.id === "vendor-venue")).toMatchObject({ bookBy: "2026-07-30", rushed: false });
  });

  it("reports progress, money and warnings", () => {
    expect(view.progress).toEqual({ done: 12, total: 34, percent: 35 });
    expect(view.money.committed).toBe(1_118_000);
    expect(view.moneyByLine.get("line-decor")?.remaining).toBe(300_000);
    expect(view.warnings).toEqual([
      "2 items are behind the ideal schedule and moved to today. Prioritise these.",
      "Vendor demand is high around Christmas; book early.",
    ]);
  });

  it("clamps due dates while an event is under way", () => {
    const late = deriveView(birthday(), "2026-12-03");
    expect(late.tasks.find((t) => t.id === "task-settle-vendor-balances")).toMatchObject({ dueDate: "2026-12-03", rushed: false });
    expect(late.daysToGo).toBe(-1);
  });
});
