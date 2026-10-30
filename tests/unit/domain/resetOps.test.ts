import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/lib/domain/budget";
import type { EventDoc } from "@/lib/domain/model/event";
import { AI, applyOk, CODE, lineAmount, rejectReason, wedding } from "../../domainFixtures";

function reviewing(plan: EventDoc): EventDoc {
  plan.review = { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" };
  return plan;
}

describe("reset_section", () => {
  it("is accepted only from a code proposal", () => {
    expect(rejectReason(wedding(), { type: "reset_section", section: "ideas" })).toMatch(/starter template/);
    expect(rejectReason(wedding(), { type: "reset_section", section: "ideas" }, AI)).toMatch(/starter template/);
  });

  it("budget: uses the template split, relinks vendors by name and clamps lines at what is committed", () => {
    const plan = applyOk(reviewing(wedding()), { type: "reset_section", section: "budget" }, CODE);
    expect(plan.budget.lines.map((l) => l.category)).toEqual([
      "Venue",
      "Catering",
      "Decor",
      "Tent & lighting",
      "Attire & jewellery",
      "Photography",
      "Entertainment",
      "Mehndi & makeup",
      "Pandit & rituals",
      "Invitations & gifts",
      "Contingency",
    ]);
    expect(lineAmount(plan, "line-photography")).toBe(240_000);
    expect(sumAmounts(plan.budget.lines)).toBe(2_500_000);
    expect(plan.budget.lines.every((l) => l.origin === "code")).toBe(true);
    expect(plan.vendors.find((v) => v.id === "vendor-mehndi-artist")?.budgetLineId).toBe("line-contingency");
    expect(plan.vendors.find((v) => v.id === "vendor-venue")?.budgetLineId).toBe("line-venue");
    expect(plan.review?.budget).toBe("reset");
  });

  it("budget: fails when booked vendors already exceed the total", () => {
    const plan = applyOk(wedding(), { type: "set_total_budget", total: 1_000_000, strategy: "rescale" });
    expect(rejectReason(plan, { type: "reset_section", section: "budget" }, CODE)).toMatch(/already exceed the budget/);
  });

  it("timeline: replaces open AI tasks with the template and keeps done and user tasks", () => {
    let plan = applyOk(wedding(), { type: "add_task", title: "Book a pandit", category: "Rituals", daysBefore: 40 });
    plan = applyOk(plan, { type: "reset_section", section: "timeline" }, CODE);
    expect(plan.tasks.filter((t) => t.done)).toHaveLength(12);
    expect(plan.tasks.find((t) => t.title === "Book a pandit")?.origin).toBe("user");
    expect(plan.tasks.filter((t) => t.origin === "code").map((t) => t.title)).toContain("Send thank-you messages");
    expect(plan.tasks.find((t) => t.title === "Book makeup artist")).toBeUndefined();
    // The wedding starter plan has 17 tasks (MQW-09); one ("Book the photographer") is already done here.
    expect(plan.tasks).toHaveLength(30);
  });

  it("timeline: does not add a template task the user already has", () => {
    const plan = applyOk(wedding(), { type: "add_task", title: "Send invitations!", category: "Guests", daysBefore: 30 });
    const reset = applyOk(plan, { type: "reset_section", section: "timeline" }, CODE);
    expect(reset.tasks.filter((t) => t.title.startsWith("Send invitations"))).toHaveLength(1);
  });

  it("vendors: replaces untouched AI vendors and keeps the rest", () => {
    const plan = applyOk(wedding(), { type: "reset_section", section: "vendors" }, CODE);
    expect(plan.vendors.map((v) => v.category)).toEqual([
      "Venue",
      "Caterer",
      "Videographer",
      "Invitation printer",
      "Mehndi artist",
      "Photographer",
      "Sound & lights",
      "Bridal car",
      "Decorator",
      "Tent & lighting",
      "Makeup artist",
      "Pandit",
      "DJ / band",
    ]);
    expect(plan.vendors.at(-1)).toMatchObject({ id: "vendor-dj-band", status: "to_research", origin: "code" });
  });

  it("ideas: removes only suggested ideas without remembering them", () => {
    const plan = wedding();
    plan.ideas[0].state = "suggested";
    const reset = applyOk(reviewing(plan), { type: "reset_section", section: "ideas" }, CODE);
    expect(reset.ideas).toHaveLength(5);
    expect(reset.dismissedIdeaTitles).toEqual([]);
    expect(reset.review?.ideas).toBe("reset");
  });
});
