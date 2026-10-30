import { describe, expect, it } from "vitest";
import { enquiryContext, factsOf, honoreesOf, ideasContext, instructContext, MAX_CONTEXT_TASKS, whatifContext } from "@/lib/ai/context";
import { demoFixture } from "@/lib/demo/fixtures";
import type { EventDoc } from "@/lib/domain/model/event";
import { TODAY, wedding } from "../../domainFixtures";

/** A plan carrying private text in every field the model must never see (spec 9.4). */
function withSecrets(): EventDoc {
  const plan = wedding();
  return {
    ...plan,
    details: { ...plan.details, title: "SECRET-TITLE" },
    honorees: plan.honorees.map((h) => ({ ...h, name: "SECRET-NAME", notes: "SECRET-NOTE", gender: "undisclosed" })),
    vendors: plan.vendors.map((v) => ({ ...v, label: "SECRET-VENDOR", contact: "SECRET-CONTACT", notes: "SECRET-VNOTE" })),
  };
}

describe("AI context projections", () => {
  it("never carries titles, names, notes, vendor labels or contacts", () => {
    const plan = withSecrets();
    const vendor = plan.vendors.find((v) => v.id === "vendor-caterer")!;
    const all = JSON.stringify([
      instructContext(plan, TODAY),
      ideasContext(plan, { role: "self_family", budgetStyle: "balanced" }, TODAY),
      whatifContext(plan, 2_000_000, ["line-catering"], TODAY),
      enquiryContext(plan, vendor, { questions: [], includeBudget: true }),
    ]);
    expect(all).not.toMatch(/SECRET/);
  });

  it("sends honorees by role, age, gender and interests, with undisclosed gender as null", () => {
    expect(honoreesOf(withSecrets())[0]).toEqual({ role: "bride", age: null, gender: null, interests: [] });
    const birthday = demoFixture("birthday", TODAY).event;
    expect(honoreesOf({ ...birthday, honorees: birthday.honorees.map((h) => ({ ...h, age: null })) })[0].age).toBe(
      birthday.details.milestone,
    );
  });

  it("gives code-computed facts and caps the task list", () => {
    const plan = wedding();
    const facts = factsOf(plan, TODAY);
    expect(facts).toMatchObject({ total: plan.budget.total, tasksTotal: plan.tasks.length, daysToGo: 60 });
    const many = { ...plan, tasks: Array.from({ length: MAX_CONTEXT_TASKS + 5 }, (_, i) => ({ ...plan.tasks[0], id: `t${i}` })) };
    expect(instructContext(many, TODAY).tasks).toHaveLength(MAX_CONTEXT_TASKS);
  });

  it("describes ideas inputs: season, tier, age band and a missing profile", () => {
    const { event } = demoFixture("birthday", TODAY);
    const context = ideasContext(event, null, TODAY);
    expect(context.profile).toEqual({ role: null, budgetStyle: null });
    expect(context.honorees[0]).toMatchObject({ age: 6, gender: "female", ageBand: "6-9" });
    expect(context.budget.perGuest).toBe(Math.round(event.budget.total / event.guests.total));
    expect(ideasContext(withSecrets(), null, TODAY).honorees[0].ageBand).toBeNull();
  });

  it("uses the free-text occasion for 'other', marks protected lines and links an enquiry to its functions", () => {
    const plan = wedding();
    const other = { ...plan, details: { ...plan.details, occasion: "other" as const, occasionOther: "Housewarming" } };
    expect(whatifContext(other, 2_000_000, ["line-catering"], TODAY)).toMatchObject({ occasion: "Housewarming", newTotal: 2_000_000 });
    expect(
      whatifContext(plan, 2_000_000, ["line-catering"], TODAY)
        .categories.filter((c) => c.protected)
        .map((c) => c.category),
    ).toEqual(["Catering"]);
    expect(
      whatifContext({ ...plan, details: { ...plan.details, occasion: "other" as const, occasionOther: "" } }, 1, [], TODAY).occasion,
    ).toBe("other");
    const caterer = plan.vendors.find((v) => v.id === "vendor-caterer")!;
    const enquiry = enquiryContext(plan, caterer, { questions: ["Live counters?"], includeBudget: true });
    expect(enquiry.functions.map((f) => f.name)).toEqual(["Haldi", "Sangeet", "Wedding", "Reception"]);
    expect(enquiry.budget).toBe(750_000);
    expect(enquiryContext(plan, caterer, { questions: [], includeBudget: false }).budget).toBeNull();
    expect(
      enquiryContext(
        plan,
        plan.vendors.find((v) => v.id === "vendor-pandit")!,
        { questions: [], includeBudget: true },
      ).budget,
    ).toBeNull();
  });
});
