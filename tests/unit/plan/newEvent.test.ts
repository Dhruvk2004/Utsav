import { describe, expect, it } from "vitest";
import { buildPlanPrompt } from "@/lib/ai/prompts/plan";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { createEventSchema } from "@/lib/domain/model/createEvent";
import { moneyByLine } from "@/lib/domain/money";
import { applyOperations } from "@/lib/domain/ops/apply";
import { buildPlan } from "@/lib/domain/planner";
import { CREATED_VERSION } from "@/lib/plan/commands";
import { creationHistory, functionShares, planContextOf, planInputOf, planToEventDoc, templateEventDoc } from "@/lib/plan/newEvent";
import { makeDraft } from "../../fixtures";
import { createRequest, NOW, TODAY } from "../../helpers/server";

const request = createEventSchema.parse(createRequest());
const options = { ownerUid: "u1", today: TODAY, now: NOW, budgetStyle: null };
const aiPlan = (draft = makeDraft()) => buildPlan(planInputOf(request), draft, { today: TODAY, source: "ai", now: new Date(NOW) });

describe("planInputOf and planContextOf", () => {
  it("keep the request's planning facts and drop names and private notes from the AI context", () => {
    expect(planInputOf(request)).toMatchObject({ eventType: "wedding", guestCount: 350, functions: ["Sangeet", "Wedding"] });
    const context = planContextOf(request, { budgetStyle: "simple", role: "self_family" });
    expect(context.honorees).toEqual([{ role: "bride", age: 28, gender: null, interests: ["Kathak"] }]);
    expect(context).toMatchObject({ budgetStyle: "simple", role: "self_family", flags: { elderly: true } });
    expect(planContextOf(request, null)).toMatchObject({ budgetStyle: null, role: null });
  });

  it("builds a T1 prompt with no title, honoree names or notes (spec 6.11, 9.4)", () => {
    const prompt = buildPlanPrompt(planInputOf(request), TODAY, planContextOf(request, { budgetStyle: "balanced", role: "parent" }));
    for (const secret of ["Ananya & Rohan", "Ananya", "Allergic to lilies"]) expect(prompt).not.toContain(secret);
    expect(prompt).toContain('"role": "bride"');
    expect(prompt).toContain('"interests": [\n        "Kathak"');
    expect(prompt).toContain("elderly guests");
    expect(prompt).toContain('"budgetStyle": "balanced"');
  });
});

describe("functionShares", () => {
  it("keeps typed shares and splits the rest by the plan's weights, to exactly 100.0", () => {
    expect(functionShares([15, null], [30, 70])).toEqual([15, 85]);
    expect(functionShares([null, null, null], [1, 1, 1])).toEqual([33.4, 33.3, 33.3]);
    expect(functionShares([20, 30], [1, 1])).toEqual([40, 60]);
    expect(functionShares([100, null], [1, 1])).toEqual([100, 0]);
  });
});

describe("planToEventDoc", () => {
  it("maps an AI plan to a stored event that satisfies every invariant", () => {
    const event = planToEventDoc(aiPlan(), request, { ...options, source: "ai" });
    expect(planInvariantViolations(event)).toEqual([]);
    expect(event).toMatchObject({ ownerUid: "u1", version: CREATED_VERSION, source: "ai", status: "active", createdAt: NOW });
    expect(event.details.title).toBe("Ananya & Rohan's wedding");
    expect(event.review).toEqual({ budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" });
    expect(event.budget.lines.every((line) => line.origin === "ai")).toBe(true);
    expect(event.ideas[0]).toMatchObject({ state: "suggested", origin: "ai", source: "ai", category: "entertainment", basis: [] });
    expect(event.honorees[0]).toMatchObject({ id: "person-1", name: "Ananya", notes: "Allergic to lilies" });
    expect(event.guests.total).toBe(350);
  });

  it("keeps typed function dates, times and shares, and fills the rest from the plan", () => {
    const event = planToEventDoc(aiPlan(), request, { ...options, source: "ai" });
    expect(
      event.functions.map(({ name, date, startTime, sharePercent, origin }) => ({ name, date, startTime, sharePercent, origin })),
    ).toEqual([
      { name: "Sangeet", date: "2026-12-13", startTime: "19:00", sharePercent: 15, origin: "user" },
      { name: "Wedding", date: "2026-12-14", startTime: null, sharePercent: 85, origin: "user" },
    ]);
    expect(event.functions[0].amount + event.functions[1].amount).toBe(2_500_000);
  });

  it("uses the AI's functions when none were typed, and links vendors to their budget lines", () => {
    const untyped = createEventSchema.parse(createRequest({ functions: [] }));
    const plan = buildPlan(planInputOf(untyped), makeDraft(), { today: TODAY, source: "ai", now: new Date(NOW) });
    const event = planToEventDoc(plan, untyped, { ...options, source: "ai" });
    expect(event.functions.map((fn) => [fn.name, fn.origin])).toEqual([
      ["Mehndi", "ai"],
      ["Sangeet", "ai"],
      ["Wedding", "ai"],
    ]);
    const caterer = event.vendors.find((vendor) => vendor.category === "Caterer");
    expect(caterer?.budgetLineId).toBe(event.budget.lines.find((line) => line.category === "Catering")?.id);
    expect(event.vendors.find((vendor) => vendor.category === "Decorator")?.budgetLineId).toBeNull();
    expect(caterer?.history).toEqual([{ status: "to_research", at: NOW }]);
  });

  it("adds a Contingency line sized by budget style when the plan has none (invariant 2)", () => {
    const draft = makeDraft({
      budget: [
        { category: "Venue", percent: 50, note: "" },
        { category: "Catering", percent: 50, note: "" },
      ],
    });
    const event = planToEventDoc(aiPlan(draft), request, { ...options, budgetStyle: "simple", source: "ai" });
    expect(event.budget.lines.find((line) => line.category === "Contingency")?.amount).toBe(250_000);
    expect(planInvariantViolations(event)).toEqual([]);
  });

  it("writes template and blank plans as code-authored, with no ideas and no review", () => {
    const template = templateEventDoc(request, options);
    expect(template).toMatchObject({ source: "template", review: null, ideas: [] });
    expect(template.tasks.every((task) => task.origin === "code")).toBe(true);
    const blank = planToEventDoc(aiPlan(), request, { ...options, source: "blank" });
    expect(blank).toMatchObject({ source: "blank", review: null, ideas: [] });
  });
});

describe("starter template events (MQW-01, BP-01, CO-04 regressions)", () => {
  it.each(["wedding", "birthday", "community"] as const)(
    "links every %s starter vendor to a budget line, so booked money shows on that line",
    (eventType) => {
      const template = templateEventDoc(createEventSchema.parse(createRequest({ eventType, functions: [] })), options);
      for (const vendor of template.vendors) expect(vendor.budgetLineId, vendor.category).not.toBeNull();
    },
  );

  it("shows a booked caterer's quote and payment on the Catering line", () => {
    const template = templateEventDoc(request, options);
    const caterer = template.vendors.find((vendor) => vendor.category === "Caterer")!;
    const booked = applyOperations(
      template,
      [{ type: "set_vendor_status", vendorId: caterer.id, status: "booked", quotedAmount: 420_000, paidAmount: 100_000 }],
      { today: TODAY, actor: "user" },
    );
    expect(booked.results[0]).toEqual({ ok: true });
    const catering = booked.plan.budget.lines.find((line) => line.category === "Catering")!;
    expect(moneyByLine(booked.plan).get(catering.id)).toMatchObject({ committed: 420_000, paid: 100_000 });
  });

  it("builds a Diwali community plan from the occasion", () => {
    const diwali = templateEventDoc(
      createEventSchema.parse(createRequest({ eventType: "community", occasion: "diwali", functions: [] })),
      options,
    );
    expect(diwali.summary.text).toMatch(/^A starter plan for a Diwali community event/);
    expect(diwali.budget.lines.map((line) => line.category)).toContain("Decor & lighting");
    expect(diwali.tasks.map((task) => task.title)).toContain("Buy diyas, lanterns and lights");
  });
});

describe("creationHistory", () => {
  it("snapshots the starter template as the AI plan's `before`, from version 0 to 1", () => {
    const event = planToEventDoc(aiPlan(), request, { ...options, source: "ai" });
    const entry = creationHistory(event, templateEventDoc(request, options), { today: TODAY, now: NOW });
    expect(entry).toMatchObject({ actor: "system", label: "AI plan created", ops: [], versionBefore: 0, versionAfter: 1 });
    expect(entry.before.source).toBe("template");
    expect(entry.before.review).toEqual({ budget: "reset", timeline: "reset", vendors: "reset", ideas: "reset" });
    expect(entry.before.ideas).toEqual([]);
  });
});
