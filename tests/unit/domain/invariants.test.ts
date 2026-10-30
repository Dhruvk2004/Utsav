import { describe, expect, it } from "vitest";
import { assertPlanInvariants, PlanInvariantError, planInvariantViolations } from "@/lib/domain/invariants";
import type { EventDoc } from "@/lib/domain/model/event";
import { wedding } from "../../domainFixtures";

function broken(mutate: (plan: EventDoc) => void): string[] {
  const plan = wedding();
  mutate(plan);
  return planInvariantViolations(plan);
}

describe("planInvariantViolations", () => {
  it("passes a consistent plan", () => {
    expect(planInvariantViolations(wedding())).toEqual([]);
    expect(() => assertPlanInvariants(wedding())).not.toThrow();
  });

  it.each<[string, (plan: EventDoc) => void, string]>([
    ["a fractional amount", (p) => (p.budget.lines[0].amount += 0.5), "1: budget amounts must be non-negative integers"],
    ["lines that do not sum", (p) => (p.budget.total += 1), "1: budget lines must sum to the total"],
    ["no Contingency", (p) => (p.budget.lines.at(-1)!.category = "Buffer"), "2: exactly one Contingency line"],
    ["shares off 100", (p) => (p.functions[0].sharePercent = 30), "3: function shares must sum to 100"],
    ["a stale function amount", (p) => (p.functions[0].amount += 1), "3: function amounts must follow shares"],
    ["a function too early", (p) => (p.functions[0].date = "2026-12-01"), "4: fn-haldi date out of range"],
    ["a lone start time", (p) => (p.functions[1].startTime = "10:00"), "4: fn-mehndi times invalid"],
    ["an end before the start", (p) => (p.functions[0].endTime = "09:00"), "4: fn-haldi times invalid"],
    ["a task too far after", (p) => (p.tasks[0].daysBefore = -8), "5: task-fix-the-wedding-date-with-both-families daysBefore"],
    ["a pin too late", (p) => (p.tasks[0].pinnedDate = "2027-01-04"), "5: task-fix-the-wedding-date-with-both-families pinned too late"],
    ["a booked vendor without a quote", (p) => (p.vendors[0].quotedAmount = null), "6: vendor-venue needs a quote"],
    ["a paid vendor without payment", (p) => (p.vendors[3].paidAmount = 0), "6: vendor-invitation-printer needs a payment"],
    ["duplicate ids", (p) => (p.ideas[1].id = p.ideas[0].id), "7: duplicate ids in ideas"],
    ["duplicate draft ids", (p) => (p.vendors[0].drafts = [draft(), draft()]), "7: duplicate draft ids in vendor-venue"],
    ["duplicate categories", (p) => (p.budget.lines[1].category = "venue"), "7: duplicate categories"],
    ["too many dismissed titles", (p) => (p.dismissedIdeaTitles = Array(51).fill("x")), "8: too many dismissedIdeaTitles"],
    ["stale stats", (p) => (p.stats.tasksDone = 0), "9: stats are stale"],
    [
      "a suggested library idea",
      (p) => Object.assign(p.ideas[0], { state: "suggested", source: "library" }),
      "10: idea-fusion-haldi suggested but not from AI",
    ],
    ["a dangling budget line", (p) => (p.vendors[0].budgetLineId = "line-x"), "11: vendor-venue budget line missing"],
    ["a dangling vendor function", (p) => (p.vendors[1].functionIds = ["fn-x"]), "11: vendor-caterer function missing"],
    [
      "a dangling task function",
      (p) => (p.tasks[0].functionId = "fn-x"),
      "11: task-fix-the-wedding-date-with-both-families function missing",
    ],
    ["a kids flag out of sync", (p) => (p.flags.kids = false), "12: kids flag out of sync"],
    ["an elderly flag out of sync", (p) => (p.flags.elderly = false), "12: elderly flag out of sync"],
  ])("reports %s", (_, mutate, violation) => {
    expect(broken(mutate)).toContain(violation);
  });

  it("ignores the order of stored stats keys", () => {
    const plan = wedding();
    const { vendorsByStatus } = plan.stats;
    plan.stats.vendorsByStatus = Object.fromEntries(Object.entries(vendorsByStatus).reverse()) as typeof vendorsByStatus;
    expect(planInvariantViolations(plan)).toEqual([]);
  });

  it("reports the cap on each list", () => {
    expect(broken((p) => (p.functions = Array(9).fill(p.functions[0])))).toContain("8: too many functions");
  });

  it("throws a PlanInvariantError listing the violations", () => {
    const plan = wedding();
    plan.budget.total += 1;
    expect(() => assertPlanInvariants(plan)).toThrow(PlanInvariantError);
    expect(() => assertPlanInvariants(plan)).toThrow(/sum to the total/);
  });
});

function draft() {
  return {
    id: "d1",
    channel: "email" as const,
    language: "en" as const,
    subject: "",
    body: "Hi",
    createdAt: "2026-10-28T00:00:00.000Z",
    origin: "user" as const,
  };
}
