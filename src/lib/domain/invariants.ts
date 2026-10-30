import { allocate } from "./budget";
import { addDays } from "./dates";
import { sameValue } from "./equality";
import { CAPS, FUNCTION_MAX_OFFSET, FUNCTION_MIN_OFFSET, type EventDoc } from "./model/event";
import { LIMITS } from "./schemas";
import { computeStats } from "./stats";

/** Plan invariants 1-12 (spec 8.4), checked after every apply and by the property tests. */

const SHARE_TOLERANCE = 0.1;

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function duplicates(values: string[]): string[] {
  return values.filter((value, i) => values.indexOf(value) !== i);
}

function checkBudget(plan: EventDoc, out: string[]): void {
  const { total, lines } = plan.budget;
  if (!lines.every((l) => Number.isInteger(l.amount) && l.amount >= 0) || !Number.isInteger(total) || total < 0) {
    out.push("1: budget amounts must be non-negative integers");
  }
  if (sum(lines.map((l) => l.amount)) !== total) out.push("1: budget lines must sum to the total");
  if (lines.filter((l) => l.category.trim().toLowerCase() === "contingency").length !== 1) {
    out.push("2: exactly one Contingency line");
  }
}

function checkFunctions(plan: EventDoc, out: string[]): void {
  const { functions, details } = plan;
  if (functions.length === 0) return;
  if (Math.abs(sum(functions.map((f) => f.sharePercent)) - 100) > SHARE_TOLERANCE) out.push("3: function shares must sum to 100");
  const expected = allocate(
    plan.budget.total,
    functions.map((f) => f.sharePercent),
  );
  if (functions.some((f, i) => f.amount !== expected[i])) out.push("3: function amounts must follow shares");
  const earliest = addDays(details.eventDate, FUNCTION_MIN_OFFSET);
  const latest = addDays(details.eventDate, FUNCTION_MAX_OFFSET);
  for (const fn of functions) {
    if (fn.date < earliest || fn.date > latest) out.push(`4: ${fn.id} date out of range`);
    const bothOrNone = (fn.startTime === null) === (fn.endTime === null);
    if (!bothOrNone || (fn.startTime !== null && fn.endTime !== null && fn.endTime <= fn.startTime)) {
      out.push(`4: ${fn.id} times invalid`);
    }
  }
}

function checkTasksAndVendors(plan: EventDoc, out: string[]): void {
  const latestPin = addDays(plan.details.eventDate, -LIMITS.minDaysBefore);
  for (const task of plan.tasks) {
    if (task.daysBefore < LIMITS.minDaysBefore || task.daysBefore > LIMITS.maxPlanningDays) out.push(`5: ${task.id} daysBefore`);
    if (task.pinnedDate !== null && task.pinnedDate > latestPin) out.push(`5: ${task.id} pinned too late`);
  }
  for (const vendor of plan.vendors) {
    const committed = vendor.status === "booked" || vendor.status === "paid";
    if (committed && vendor.quotedAmount === null) out.push(`6: ${vendor.id} needs a quote`);
    if (vendor.status === "paid" && vendor.paidAmount <= 0) out.push(`6: ${vendor.id} needs a payment`);
  }
}

function checkIdentity(plan: EventDoc, out: string[]): void {
  const lists = { lines: plan.budget.lines, functions: plan.functions, tasks: plan.tasks, vendors: plan.vendors, ideas: plan.ideas };
  for (const [name, items] of Object.entries(lists)) {
    if (duplicates(items.map((i) => i.id)).length > 0) out.push(`7: duplicate ids in ${name}`);
  }
  for (const vendor of plan.vendors) {
    if (duplicates(vendor.drafts.map((d) => d.id)).length > 0) out.push(`7: duplicate draft ids in ${vendor.id}`);
  }
  if (duplicates(plan.budget.lines.map((l) => l.category.trim().toLowerCase())).length > 0) out.push("7: duplicate categories");
  const caps: [unknown[], number, string][] = [
    [plan.budget.lines, CAPS.budgetLines, "lines"],
    [plan.functions, CAPS.functions, "functions"],
    [plan.tasks, CAPS.tasks, "tasks"],
    [plan.vendors, CAPS.vendors, "vendors"],
    [plan.ideas, CAPS.ideas, "ideas"],
    [plan.dismissedIdeaTitles, CAPS.dismissedIdeaTitles, "dismissedIdeaTitles"],
  ];
  for (const [items, cap, name] of caps) if (items.length > cap) out.push(`8: too many ${name}`);
}

function checkDerived(plan: EventDoc, out: string[]): void {
  if (!sameValue(plan.stats, { ...computeStats(plan), pending: plan.stats.pending })) out.push("9: stats are stale");
  for (const idea of plan.ideas) {
    if (idea.state === "suggested" && idea.source !== "ai") out.push(`10: ${idea.id} suggested but not from AI`);
  }
  const lineIds = new Set(plan.budget.lines.map((l) => l.id));
  const functionIds = new Set(plan.functions.map((f) => f.id));
  for (const vendor of plan.vendors) {
    if (vendor.budgetLineId !== null && !lineIds.has(vendor.budgetLineId)) out.push(`11: ${vendor.id} budget line missing`);
    if (vendor.functionIds.some((id) => !functionIds.has(id))) out.push(`11: ${vendor.id} function missing`);
  }
  for (const task of plan.tasks) {
    if (task.functionId !== null && !functionIds.has(task.functionId)) out.push(`11: ${task.id} function missing`);
  }
  const { guests, flags } = plan;
  if (guests.kids !== null && flags.kids !== guests.kids > 0) out.push("12: kids flag out of sync");
  if (guests.elderly !== null && flags.elderly !== guests.elderly > 0) out.push("12: elderly flag out of sync");
}

/** Every broken invariant, as "n: description"; empty when the plan is consistent. */
export function planInvariantViolations(plan: EventDoc): string[] {
  const out: string[] = [];
  checkBudget(plan, out);
  checkFunctions(plan, out);
  checkTasksAndVendors(plan, out);
  checkIdentity(plan, out);
  checkDerived(plan, out);
  return out;
}

export class PlanInvariantError extends Error {
  constructor(readonly violations: string[]) {
    super(`Plan invariants broken: ${violations.join("; ")}`);
  }
}

export function assertPlanInvariants(plan: EventDoc): void {
  const violations = planInvariantViolations(plan);
  if (violations.length > 0) throw new PlanInvariantError(violations);
}
