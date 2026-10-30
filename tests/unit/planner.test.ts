import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/lib/domain/budget";
import { buildPlan, planFunctions, planWarnings, reconcileFunctions } from "@/lib/domain/planner";
import { EVENT_TYPES } from "@/lib/domain/schemas";
import { starterDayOffsets, starterFunctionShares, templateDraft } from "@/lib/domain/template";
import { makeDraft, makeInput, makePlan, TODAY } from "../fixtures";

describe("buildPlan", () => {
  const plan = makePlan();

  it("keeps the budget total exact", () => {
    expect(plan.budget.total).toBe(1_500_000);
    expect(sumAmounts(plan.budget.lines)).toBe(1_500_000);
  });

  it("splits the budget across functions exactly", () => {
    expect(sumAmounts(plan.functions)).toBe(1_500_000);
  });

  it("dates functions back from the main day, in order", () => {
    expect(plan.functions.map((f) => [f.name, f.date])).toEqual([
      ["Mehndi", "2027-02-12"],
      ["Sangeet", "2027-02-13"],
      ["Wedding", "2027-02-14"],
    ]);
  });

  it("computes catering from the guest count", () => {
    expect(plan.catering.plates).toBe(330);
  });

  it("records the source and generation time", () => {
    expect(plan.source).toBe("ai");
    expect(plan.generatedAt).toBe("2026-11-01T10:00:00.000Z");
  });

  it("has no warnings for a comfortable, well-timed plan", () => {
    expect(plan.warnings).toEqual([]);
  });
});

describe("reconcileFunctions", () => {
  const suggested = makeDraft().functions;

  it("uses the AI's list when the user named none", () => {
    expect(reconcileFunctions([], suggested)).toBe(suggested);
  });

  it("keeps the user's functions and names, matching AI details case-insensitively", () => {
    const result = reconcileFunctions(["sangeet", "Haldi"], suggested);
    expect(result[0]).toMatchObject({ name: "sangeet", percent: 30, highlights: ["Family dance-off"] });
    expect(result[1]).toMatchObject({ name: "Haldi", dayOffset: 0, percent: 50 });
  });
});

describe("planFunctions", () => {
  it("never dates a function before today", () => {
    const input = makeInput({ eventDate: "2026-11-02" });
    const fns = planFunctions(input, TODAY, [{ name: "Mehndi", dayOffset: -5, percent: 100, highlights: [] }]);
    expect(fns[0].date).toBe(TODAY);
  });

  it("dates a reception the day after the event with a signed offset", () => {
    const fns = planFunctions(makeInput(), TODAY, [{ name: "Reception", dayOffset: 1, percent: 100, highlights: [] }]);
    expect(fns[0].date).toBe("2027-02-15");
  });
});

describe("planWarnings", () => {
  it("warns when the budget per guest is tight", () => {
    const input = makeInput({ guestCount: 500, budget: 100_000 });
    expect(planWarnings(input, { timeline: [], vendors: [] })[0]).toMatch(/₹200 per guest/);
  });

  it("warns about overdue items with correct grammar", () => {
    const plan = makePlan({ eventDate: "2026-11-20" });
    expect(plan.warnings.some((w) => /items are behind/.test(w))).toBe(true);

    const one = planWarnings(makeInput(), {
      timeline: [{ rushed: true }],
      vendors: [],
    });
    expect(one[0]).toMatch(/1 item is behind/);
  });
});

describe("planWarnings: festivals", () => {
  it("warns about vendor demand near a festival", () => {
    const warnings = planWarnings({ budget: 200_000, guestCount: 100, eventDate: "2026-11-06" }, { timeline: [], vendors: [] });
    expect(warnings).toEqual(["Vendor demand is high around Diwali; book early."]);
  });
});

describe("templateDraft", () => {
  it.each(EVENT_TYPES)("produces a valid, complete plan for a %s", (eventType) => {
    const input = makeInput({ eventType, functions: [] });
    const plan = buildPlan(input, templateDraft(input), { today: TODAY, source: "template" });
    expect(sumAmounts(plan.budget.lines)).toBe(input.budget);
    expect(plan.timeline.length).toBeGreaterThan(3);
    expect(plan.vendors.length).toBeGreaterThan(2);
    expect(plan.timeline.filter((t) => t.dueDate > input.eventDate).map((t) => t.title)).toEqual([
      "Settle vendor balances",
      "Return rented items",
      "Send thank-you messages",
    ]);
  });

  it("weights user functions by kind, ending on the main day (MQW-09 regression)", () => {
    const input = makeInput({ functions: ["Haldi", "Wedding"] });
    const draft = templateDraft(input);
    expect(draft.functions.map(({ name, dayOffset }) => ({ name, dayOffset }))).toEqual([
      { name: "Haldi", dayOffset: -1 },
      { name: "Wedding", dayOffset: 0 },
    ]);
    expect(draft.functions[1].percent).toBeGreaterThan(draft.functions[0].percent * 4);
    // The demo wedding's split: haldi and mehndi 10%, sangeet 15%, wedding 45%, reception 20%.
    expect(starterFunctionShares(["Haldi", "Mehndi", "Sangeet", "Wedding", "Reception"])).toEqual([10, 10, 15, 45, 20]);
    expect(starterFunctionShares(["Puja", "Party"])).toEqual([50, 50]);
  });

  it("gives every starter vendor a budget line, so committed money shows on that line (MQW-01, BP-01 regression)", () => {
    for (const eventType of EVENT_TYPES) {
      const draft = templateDraft(makeInput({ eventType, functions: [] }));
      const categories = draft.budget.map((line) => line.category);
      for (const vendor of draft.vendors) expect(categories).toContain(vendor.budgetCategory);
    }
  });

  it("fits an Indian wedding: pandit, mehndi, tent and lighting (MQW-09 regression)", () => {
    const draft = templateDraft(makeInput({ eventType: "wedding", functions: [] }));
    expect(draft.vendors.map((v) => v.category)).toEqual(
      expect.arrayContaining(["Pandit", "Mehndi artist", "Tent & lighting", "Decorator"]),
    );
    expect(draft.tasks.length).toBeGreaterThanOrEqual(15);
    expect(draft.budget.reduce((sum, line) => sum + line.percent, 0)).toBe(100);
  });

  it("adds Diwali decor, lighting, rangoli and diyas to a community plan, and names the occasion (CO-04 regression)", () => {
    const input = makeInput({ eventType: "community", city: "Chennai", guestCount: 600, functions: [] });
    const draft = templateDraft(input, "diwali");
    expect(draft.summary).toBe("A starter plan for a Diwali community event in Chennai for 600 guests. Edit it to suit you.");
    expect(draft.budget.find((line) => line.category === "Decor & lighting")?.note).toBe("Diyas, lanterns and fairy lights");
    expect(draft.budget.find((line) => line.category === "Activities & prizes")?.note).toMatch(/Rangoli/);
    expect(draft.tasks.map((t) => t.title)).toEqual(
      expect.arrayContaining(["Buy diyas, lanterns and lights", "Announce the rangoli competition"]),
    );
    expect(draft.vendors.find((v) => v.category === "Decor & lighting")?.budgetCategory).toBe("Decor & lighting");
    expect(draft.budget.reduce((sum, line) => sum + line.percent, 0)).toBe(100);
    expect(templateDraft(input).budget.every((line) => line.note === "")).toBe(true);
  });

  it("puts the wedding ceremony on the event date and the reception the day after (QA-14 regression)", () => {
    const input = makeInput({ eventDate: "2027-02-26", functions: ["Haldi", "Mehndi", "Sangeet", "Wedding", "Reception"] });
    expect(templateDraft(input).functions.map((fn) => fn.dayOffset)).toEqual([-3, -2, -1, 0, 1]);
    const plan = buildPlan(input, templateDraft(input), { today: TODAY, source: "template" });
    expect(Object.fromEntries(plan.functions.map((fn) => [fn.name, fn.date]))).toMatchObject({
      Sangeet: "2027-02-25",
      Wedding: "2027-02-26",
      Reception: "2027-02-27",
    });
    expect(reconcileFunctions(["Sangeet", "Pheras", "Reception"], []).map((fn) => fn.dayOffset)).toEqual([-1, 0, 1]);
  });

  it("ends on the last function when none is the ceremony, and never schedules more than 14 days before", () => {
    expect(starterDayOffsets(["Puja", "Party"])).toEqual([-1, 0]);
    expect(starterDayOffsets(Array.from({ length: 20 }, (_, i) => `Day ${i}`)).at(0)).toBe(-14);
    expect(starterDayOffsets([])).toEqual([]);
  });
});
