import { describe, expect, it } from "vitest";
import { countdownText, eventCardView, splitEvents } from "@/lib/client/eventCard";
import { stubEventSummaries } from "../../helpers/stubServices";

const today = "2026-10-28";
const [wedding, birthday, anniversary, housewarming] = stubEventSummaries(today);

describe("countdownText", () => {
  it.each([
    ["2026-10-28", "Today"],
    ["2026-10-29", "Tomorrow"],
    ["2026-10-27", "Yesterday"],
    ["2026-12-14", "47 days to go"],
    ["2026-10-08", "20 days ago"],
  ])("%s -> %s", (date, text) => expect(countdownText(date, today)).toBe(text));
});

describe("eventCardView", () => {
  it("summarises a wedding with vendors booked, tasks due and suggestions waiting", () => {
    expect(eventCardView(wedding, today)).toEqual({
      id: "stub-wedding",
      eventType: "wedding",
      typeLabel: "Wedding",
      title: "Ananya & Rohan's wedding",
      countdown: "47 days to go",
      meta: "Mon 14 Dec 2026 · Pune · 350 guests",
      budget: "₹25,00,000",
      tasksPercent: 35,
      tasksText: "35% of tasks done",
      signal: { text: "3 vendors booked · 2 due this week", tone: "default" },
      pendingText: "2 suggestions waiting",
      fromTemplate: false,
    });
  });

  it("puts an overdue task first, as a warning", () => {
    expect(eventCardView(birthday, today).signal).toEqual({ text: "1 overdue task", tone: "danger" });
  });

  it("builds the title in code when none was given and marks template plans", () => {
    const view = eventCardView(anniversary, today);
    expect(view.title).toBe("60th anniversary");
    expect(view.fromTemplate).toBe(true);
    expect(view.signal).toBeNull();
    expect(view.tasksPercent).toBe(0);
  });

  it("handles plurals, an empty plan and a single suggestion", () => {
    const one = {
      ...wedding,
      guests: 1,
      stats: { ...wedding.stats, tasksTotal: 0, openDueDates: ["2026-10-20", "2026-10-21"], pending: { count: 1, expireAt: null } },
    };
    const view = eventCardView(one, today);
    expect(view.meta).toContain("1 guest");
    expect(view.tasksPercent).toBe(0);
    expect(view.signal).toEqual({ text: "2 overdue tasks", tone: "danger" });
    expect(view.pendingText).toBe("1 suggestion waiting");
    const quiet = {
      ...wedding,
      stats: { ...wedding.stats, openDueDates: ["2026-10-29"], vendorsByStatus: { ...wedding.stats.vendorsByStatus, booked: 0, paid: 1 } },
    };
    expect(eventCardView(quiet, today).signal?.text).toBe("1 vendor booked · 1 due this week");
  });
});

describe("splitEvents", () => {
  it("orders upcoming soonest first and past most recent first, leaving archived out", () => {
    const archived = { ...wedding, id: "old", status: "archived" as const };
    const past2 = { ...housewarming, id: "older", details: { ...housewarming.details, eventDate: "2026-01-01" } };
    const { upcoming, past } = splitEvents([wedding, birthday, anniversary, housewarming, archived, past2], today);
    expect(upcoming.map((e) => e.id)).toEqual(["stub-birthday", "stub-wedding", "stub-anniversary"]);
    expect(past.map((e) => e.id)).toEqual(["stub-housewarming", "older"]);
  });
});
