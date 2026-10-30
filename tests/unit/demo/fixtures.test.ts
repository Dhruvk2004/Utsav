import { describe, expect, it } from "vitest";
import { demoFixture } from "@/lib/demo/fixtures";
import { communityEventDate, DEMO_SAMPLES, resolveEventDate } from "@/lib/demo/resolveDates";
import { todayInIndia } from "@/lib/domain/dates";
import { nearestFestival } from "@/lib/domain/festivals";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { eventDocSchema } from "@/lib/domain/model/event";
import { deriveView } from "@/lib/domain/view";

const TODAY = "2026-10-28";

describe.each(DEMO_SAMPLES)("the %s sample", (sample) => {
  const { event, profile } = demoFixture(sample, TODAY);

  it("matches the stored event schema and passes every invariant", () => {
    expect(eventDocSchema.parse(event)).toEqual(event);
    expect(planInvariantViolations(event)).toEqual([]);
  });

  it("carries no real names, vendor labels or contacts", () => {
    expect(event.vendors.every((v) => v.label === "" && v.contact === "")).toBe(true);
    expect(event.honorees.every((h) => ["Bride", "Groom", "Birthday girl"].includes(h.name) && h.notes === "")).toBe(true);
    expect(profile.language).toBe("en");
  });

  it("stays valid for any day it is rendered", () => {
    for (const today of ["2026-01-01", "2027-06-15", "2028-12-31"]) {
      expect(planInvariantViolations(demoFixture(sample, today).event)).toEqual([]);
    }
  });
});

describe("demo samples", () => {
  it("wedding: design state S1 on a date 60 days out", () => {
    const { event } = demoFixture("wedding", TODAY);
    expect(event.details.eventDate).toBe("2026-12-27");
    expect(event.functions.map((f) => [f.name, f.date, f.amount])).toEqual([
      ["Haldi", "2026-12-25", 250_000],
      ["Mehndi", "2026-12-25", 250_000],
      ["Sangeet", "2026-12-26", 375_000],
      ["Wedding", "2026-12-27", 1_125_000],
      ["Reception", "2026-12-28", 500_000],
    ]);
    expect(event.stats).toMatchObject({ tasksDone: 12, tasksTotal: 34, committed: 1_118_000 });
    expect(event.vendors.filter((v) => v.status !== "not_needed")).toHaveLength(10);
    expect(event.ideas).toHaveLength(6);
    expect(event.tasks.filter((t) => t.daysBefore < 0).map((t) => t.title)).toEqual(
      expect.arrayContaining(["Settle vendor balances", "Return rented items", "Send thank-you messages"]),
    );
  });

  it("birthday: a 6th birthday with a Jain menu, 35 days out", () => {
    const { event } = demoFixture("birthday", TODAY);
    expect(event.details).toMatchObject({ eventDate: "2026-12-02", milestone: 6, dietary: ["jain"] });
    expect(event.honorees[0]).toMatchObject({ role: "birthday_child", age: 6, gender: "female" });
    expect(event.guests).toMatchObject({ total: 40, kids: 25 });
    expect(event.flags.kids).toBe(true);
    expect(event.ideas).toHaveLength(4);
  });

  it("community: a volunteer-run Diwali two days before the festival", () => {
    const { event, profile } = demoFixture("community", TODAY);
    expect(event.details).toMatchObject({ eventDate: "2026-11-06", occasion: "diwali", traditionOther: "Residents from many states" });
    expect(profile).toEqual({ role: "community", budgetStyle: "simple", language: "en" });
    expect(event.budget.lines).toHaveLength(7);
    expect(event.tasks).toHaveLength(18);
    expect(event.vendors).toHaveLength(6);
    expect(event.ideas[0]).toMatchObject({
      title: "Rangoli competition by age group",
      basis: ["details.occasion:diwali", "profile.role:community", "guests.kids"],
    });
    expect(deriveView(event, TODAY).warnings).toContain("Vendor demand is high around Diwali; book early.");
  });

  it("uses today in India by default", () => {
    expect(demoFixture("birthday").event.details.eventDate).toBe(resolveEventDate("birthday", todayInIndia()));
  });
});

describe("communityEventDate", () => {
  it.each([
    ["before the table's first Diwali", "2026-01-15", "2026-11-06"],
    ["with just a week to go", "2026-10-30", "2026-11-06"],
    ["too close to this year's Diwali", "2026-10-31", "2027-10-27"],
    ["between Diwalis", "2027-03-01", "2027-10-27"],
    ["before the last Diwali", "2028-06-01", "2028-10-15"],
  ])("anchors two days before Diwali %s", (_, today, expected) => {
    const date = communityEventDate(today);
    expect(date).toBe(expected);
    expect(nearestFestival(date)).toMatchObject({ festival: "diwali", daysAway: 2 });
  });

  it("falls back to 30 days out with no festival claim after the table", () => {
    expect(communityEventDate("2028-10-20")).toBe("2028-11-19");
    expect(nearestFestival("2028-11-19")).toBeNull();
  });
});
