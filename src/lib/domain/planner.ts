import { allocate, buildBudgetLines, formatInr } from "./budget";
import { estimateCatering } from "./catering";
import { addDays, daysBetween } from "./dates";
import { FESTIVAL_LABELS, nearestFestival } from "./festivals";
import type { AiPlanDraft, EventInput, EventPlan, PlannedFunction } from "./schemas";
import { starterDayOffsets } from "./template";
import { scheduleTasks, scheduleVendors } from "./timeline";

/** Below this per-guest spend, food alone is hard to cover, so we warn. */
export const TIGHT_BUDGET_PER_GUEST = 500;

/**
 * Keeps the functions the user asked for, in their order, using the AI's details
 * where names match and an even split otherwise. With no user list, the AI's list is used.
 */
export function reconcileFunctions(requested: string[], suggested: AiPlanDraft["functions"]): AiPlanDraft["functions"] {
  if (requested.length === 0) return suggested;
  const byName = new Map(suggested.map((f) => [f.name.trim().toLowerCase(), f]));
  const offsets = starterDayOffsets(requested);
  return requested.map((name, i) => {
    const match = byName.get(name.trim().toLowerCase());
    return match ? { ...match, name } : { name, dayOffset: offsets[i], percent: 100 / requested.length, highlights: [] };
  });
}

export function planFunctions(input: EventInput, today: string, functions: AiPlanDraft["functions"]): PlannedFunction[] {
  const amounts = allocate(
    input.budget,
    functions.map((f) => f.percent),
  );
  const lead = Math.max(0, daysBetween(today, input.eventDate));
  return functions
    .map((fn, i) => ({
      name: fn.name,
      // Signed offsets allow a reception the day after; nothing is scheduled before today.
      date: addDays(input.eventDate, Math.max(fn.dayOffset, -lead)),
      amount: amounts[i],
      highlights: fn.highlights,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function planWarnings(
  input: Pick<EventInput, "budget" | "guestCount" | "eventDate">,
  plan: { timeline: { rushed: boolean }[]; vendors: { rushed: boolean }[] },
): string[] {
  const warnings: string[] = [];
  const perGuest = Math.floor(input.budget / input.guestCount);
  if (perGuest < TIGHT_BUDGET_PER_GUEST) {
    warnings.push(`The budget works out to ${formatInr(perGuest)} per guest, which is tight. Consider fewer guests or a simpler menu.`);
  }
  const rushed = plan.timeline.filter((t) => t.rushed).length + plan.vendors.filter((v) => v.rushed).length;
  if (rushed > 0) {
    warnings.push(`${rushed} item${rushed === 1 ? " is" : "s are"} behind the ideal schedule and moved to today. Prioritise these.`);
  }
  const festival = nearestFestival(input.eventDate);
  if (festival) warnings.push(`Vendor demand is high around ${FESTIVAL_LABELS[festival.festival]}; book early.`);
  return warnings;
}

/**
 * Turns an AI (or template) draft into a final plan. All money and date maths
 * happens here, so the totals and deadlines are always consistent.
 */
export function buildPlan(
  input: EventInput,
  draft: AiPlanDraft,
  options: { today: string; source: EventPlan["source"]; now?: Date },
): EventPlan {
  const timeline = scheduleTasks(input.eventDate, options.today, draft.tasks);
  const vendors = scheduleVendors(input.eventDate, options.today, draft.vendors);
  const functions = planFunctions(input, options.today, reconcileFunctions(input.functions, draft.functions));

  return {
    input,
    generatedAt: (options.now ?? new Date()).toISOString(),
    source: options.source,
    summary: draft.summary,
    budget: { total: input.budget, lines: buildBudgetLines(input.budget, draft.budget) },
    functions,
    timeline,
    vendors,
    ideas: draft.ideas,
    catering: estimateCatering(input.guestCount),
    warnings: planWarnings(input, { timeline, vendors }),
  };
}
