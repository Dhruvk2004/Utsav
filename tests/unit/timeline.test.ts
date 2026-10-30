import { describe, expect, it } from "vitest";
import { dueDateFor, groupByPhase, phaseFor, progress, scheduleTasks, scheduleVendors, slugId } from "@/lib/domain/timeline";

const EVENT = "2027-01-31";

describe("scheduleTasks", () => {
  it("converts days-before offsets into due dates, sorted by date", () => {
    const tasks = scheduleTasks(EVENT, "2026-11-01", [
      { title: "Cake", category: "Food", daysBefore: 3 },
      { title: "Venue", category: "Venue", daysBefore: 60 },
    ]);
    expect(tasks.map((t) => [t.title, t.dueDate, t.rushed])).toEqual([
      ["Venue", "2026-12-02", false],
      ["Cake", "2027-01-28", false],
    ]);
  });

  it("pulls overdue tasks forward to today and flags them", () => {
    const [task] = scheduleTasks(EVENT, "2027-01-21", [{ title: "Venue", category: "Venue", daysBefore: 60 }]);
    expect(task).toMatchObject({ dueDate: "2027-01-21", rushed: true, daysBefore: 10 });
  });

  it("removes duplicate tasks", () => {
    const tasks = scheduleTasks(EVENT, "2026-11-01", [
      { title: "Book DJ", category: "Music", daysBefore: 30 },
      { title: "Book DJ", category: "Music", daysBefore: 30 },
    ]);
    expect(tasks).toHaveLength(1);
  });

  it("keeps tasks on the same date in alphabetical order", () => {
    const tasks = scheduleTasks(EVENT, "2026-11-01", [
      { title: "Zebra", category: "x", daysBefore: 1 },
      { title: "Apple", category: "x", daysBefore: 1 },
    ]);
    expect(tasks.map((t) => t.title)).toEqual(["Apple", "Zebra"]);
  });

  it("gives tasks stable ids", () => {
    const [a] = scheduleTasks(EVENT, "2026-11-01", [{ title: "Send Invites!", category: "x", daysBefore: 30 }]);
    expect(a.id).toBe("task-send-invites-30");
  });
});

describe("scheduleVendors", () => {
  it("sets a book-by date and flags late bookings", () => {
    const vendors = scheduleVendors(EVENT, "2027-01-11", [
      { category: "Caterer", bookByDaysBefore: 10, questions: ["Tasting?"], budgetCategory: "Catering" },
      { category: "Venue", bookByDaysBefore: 60, questions: [] },
    ]);
    expect(vendors).toEqual([
      {
        id: "vendor-venue",
        category: "Venue",
        bookBy: "2027-01-11",
        bookByDaysBefore: 60,
        rushed: true,
        questions: [],
        budgetCategory: null,
      },
      {
        id: "vendor-caterer",
        category: "Caterer",
        bookBy: "2027-01-21",
        bookByDaysBefore: 10,
        rushed: false,
        questions: ["Tasting?"],
        budgetCategory: "Catering",
      },
    ]);
  });
});

describe("phases", () => {
  it.each([
    [120, "early"],
    [90, "early"],
    [45, "months"],
    [10, "weeks"],
    [3, "final"],
    [0, "day"],
  ])("puts %i days before into %s", (days, phase) => {
    expect(phaseFor(days).id).toBe(phase);
  });

  it("groups tasks and drops empty phases", () => {
    const tasks = scheduleTasks(EVENT, "2026-11-01", [
      { title: "A", category: "x", daysBefore: 60 },
      { title: "B", category: "x", daysBefore: 0 },
    ]);
    const groups = groupByPhase(tasks, EVENT);
    expect(groups.map((g) => g.phase.id)).toEqual(["months", "day"]);
  });
});

describe("progress", () => {
  it("counts only ids that belong to the list", () => {
    expect(progress(new Set(["a", "z"]), ["a", "b", "c", "d"])).toEqual({ done: 1, total: 4, percent: 25 });
  });

  it("handles an empty list", () => {
    expect(progress(new Set(), [])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("task ids", () => {
  it("stay within the stored 80-character limit for the longest titles (real Gemini regression)", () => {
    const [task] = scheduleTasks("2027-06-20", "2026-10-30", [{ title: "a".repeat(120), category: "Decor", daysBefore: 730 }]);
    expect(task.id.length).toBeLessThanOrEqual(80);
  });

  it("are unchanged for ordinary titles", () => {
    const [task] = scheduleTasks("2027-06-20", "2026-10-30", [{ title: "Book the venue", category: "Venue", daysBefore: 30 }]);
    expect(task.id).toBe("task-book-the-venue-30");
  });
});

describe("slugId", () => {
  it("keeps Devanagari text so Hindi plans still get unique ids", () => {
    expect(slugId("task", "मेहंदी की तैयारी", 2)).toBe("task-मेहंदी-की-तैयारी-2");
  });

  it("produces different ids for different Hindi titles", () => {
    expect(slugId("task", "संगीत")).not.toBe(slugId("task", "हल्दी"));
  });
});

describe("post-event tasks", () => {
  it("dates negative offsets after the event and groups them in After the event", () => {
    const tasks = scheduleTasks(EVENT, "2026-11-01", [
      { title: "Thank-you notes", category: "Guests", daysBefore: -5 },
      { title: "Settle balances", category: "Budget", daysBefore: -1 },
    ]);
    expect(tasks.map((t) => [t.title, t.dueDate, t.rushed])).toEqual([
      ["Settle balances", "2027-02-01", false],
      ["Thank-you notes", "2027-02-05", false],
    ]);
    expect(groupByPhase(tasks, EVENT).map((g) => g.phase.label)).toEqual(["After the event"]);
    expect(phaseFor(-7).id).toBe("after");
  });

  it("pulls a passed post-event task to today while the event is under way", () => {
    expect(dueDateFor(EVENT, "2027-02-03", -1)).toEqual({ dueDate: "2027-02-03", rushed: true });
    expect(dueDateFor(EVENT, "2027-02-03", -7)).toEqual({ dueDate: "2027-02-07", rushed: false });
  });
});
