import { formatCount } from "./budget";
import { OCCASION_LABELS } from "./labels";
import type { Occasion } from "./model/enums";
import { LIMITS, type AiPlanDraft, type EventInput, type EventType } from "./schemas";

type BudgetSplit = AiPlanDraft["budget"];

const SPLITS: Record<EventType, BudgetSplit> = {
  wedding: [
    { category: "Venue", percent: 20, note: "" },
    { category: "Catering", percent: 30, note: "" },
    { category: "Decor", percent: 12, note: "" },
    { category: "Tent & lighting", percent: 4, note: "" },
    { category: "Attire & jewellery", percent: 10, note: "" },
    { category: "Photography", percent: 8, note: "" },
    { category: "Entertainment", percent: 4, note: "" },
    { category: "Mehndi & makeup", percent: 3, note: "" },
    { category: "Pandit & rituals", percent: 2, note: "" },
    { category: "Invitations & gifts", percent: 2, note: "" },
    { category: "Contingency", percent: 5, note: "" },
  ],
  birthday: [
    { category: "Venue", percent: 25, note: "" },
    { category: "Food & cake", percent: 40, note: "" },
    { category: "Decor", percent: 15, note: "" },
    { category: "Entertainment", percent: 10, note: "" },
    { category: "Return gifts", percent: 5, note: "" },
    { category: "Contingency", percent: 5, note: "" },
  ],
  anniversary: [
    { category: "Venue", percent: 30, note: "" },
    { category: "Food", percent: 35, note: "" },
    { category: "Decor", percent: 15, note: "" },
    { category: "Photography", percent: 10, note: "" },
    { category: "Gifts", percent: 5, note: "" },
    { category: "Contingency", percent: 5, note: "" },
  ],
  community: [
    { category: "Venue & permits", percent: 20, note: "" },
    { category: "Food & refreshments", percent: 30, note: "" },
    { category: "Sound & stage", percent: 12, note: "" },
    { category: "Decor & lighting", percent: 10, note: "" },
    { category: "Publicity", percent: 5, note: "" },
    { category: "Safety & cleanup", percent: 8, note: "" },
    { category: "Activities & prizes", percent: 5, note: "" },
    { category: "Contingency", percent: 10, note: "" },
  ],
  other: [
    { category: "Venue", percent: 30, note: "" },
    { category: "Food", percent: 35, note: "" },
    { category: "Decor", percent: 15, note: "" },
    { category: "Entertainment", percent: 10, note: "" },
    { category: "Contingency", percent: 10, note: "" },
  ],
};

/** Festival touches for the lines a festival changes (MQW-09, CO-04): same categories, festival notes. */
const FESTIVAL_NOTES: Partial<Record<Occasion, Record<string, string>>> = {
  diwali: {
    "Decor & lighting": "Diyas, lanterns and fairy lights",
    "Activities & prizes": "Rangoli competition prizes and colours",
    Decor: "Diyas, lanterns and marigolds",
  },
  navratri: { "Activities & prizes": "Garba night prizes", "Sound & stage": "Dandiya music" },
  ganesh_chaturthi: { "Decor & lighting": "Pandal decor and lighting", "Activities & prizes": "Aarti and children's competitions" },
  holi: { "Activities & prizes": "Organic colours and water stations" },
};

const COMMON_TASKS: AiPlanDraft["tasks"] = [
  { title: "Fix the guest list", category: "Guests", daysBefore: 60 },
  { title: "Book the venue", category: "Venue", daysBefore: 60 },
  { title: "Send invitations", category: "Guests", daysBefore: 30 },
  { title: "Confirm the menu and final headcount", category: "Food", daysBefore: 7 },
  { title: "Share the day-of schedule with vendors", category: "Coordination", daysBefore: 2 },
  // "After the event" phase: negative offsets are days after the event.
  { title: "Settle vendor balances", category: "Budget", daysBefore: -1 },
  { title: "Return rented items", category: "Logistics", daysBefore: -2 },
  { title: "Send thank-you messages", category: "Guests", daysBefore: -5 },
];

const EXTRA_TASKS: Partial<Record<EventType, AiPlanDraft["tasks"]>> = {
  wedding: [
    { title: "Fix the muhurat with the pandit", category: "Rituals", daysBefore: 120 },
    { title: "Book the photographer", category: "Photography", daysBefore: 120 },
    { title: "Book the caterer and schedule a menu tasting", category: "Food", daysBefore: 90 },
    { title: "Book the decorator and the tent and lighting", category: "Decor", daysBefore: 75 },
    { title: "Book the makeup and mehndi artists", category: "Attire", daysBefore: 60 },
    { title: "Finalise outfits and fittings", category: "Attire", daysBefore: 45 },
    { title: "Book the DJ or band for the sangeet", category: "Entertainment", daysBefore: 45 },
    { title: "Arrange guest stay and transport", category: "Logistics", daysBefore: 30 },
    { title: "Buy the puja samagri and wedding rituals items", category: "Rituals", daysBefore: 10 },
  ],
  birthday: [{ title: "Order the cake", category: "Food", daysBefore: 5 }],
  community: [
    { title: "Apply for local permissions", category: "Permits", daysBefore: 45 },
    { title: "Recruit volunteers", category: "People", daysBefore: 21 },
  ],
};

const FESTIVAL_TASKS: Partial<Record<Occasion, AiPlanDraft["tasks"]>> = {
  diwali: [
    { title: "Buy diyas, lanterns and lights", category: "Decor", daysBefore: 14 },
    { title: "Announce the rangoli competition", category: "Activities", daysBefore: 14 },
    { title: "Plan a safe, low-noise crackers area", category: "Safety", daysBefore: 7 },
  ],
  navratri: [{ title: "Book the garba music and sound", category: "Entertainment", daysBefore: 30 }],
  ganesh_chaturthi: [{ title: "Order the idol and plan the visarjan", category: "Rituals", daysBefore: 30 }],
  holi: [{ title: "Buy organic colours", category: "Activities", daysBefore: 7 }],
};

/** Starter vendors with the budget line each one is paid from (MQW-01, BP-01), so committed money shows on that line. */
const VENDORS: Record<EventType, [vendor: string, budgetCategory: string][]> = {
  wedding: [
    ["Venue", "Venue"],
    ["Caterer", "Catering"],
    ["Decorator", "Decor"],
    ["Tent & lighting", "Tent & lighting"],
    ["Photographer", "Photography"],
    ["Makeup artist", "Mehndi & makeup"],
    ["Mehndi artist", "Mehndi & makeup"],
    ["Pandit", "Pandit & rituals"],
    ["DJ / band", "Entertainment"],
  ],
  birthday: [
    ["Venue", "Venue"],
    ["Caterer", "Food & cake"],
    ["Baker", "Food & cake"],
    ["Decorator", "Decor"],
    ["Entertainer", "Entertainment"],
  ],
  anniversary: [
    ["Venue", "Venue"],
    ["Caterer", "Food"],
    ["Decorator", "Decor"],
    ["Photographer", "Photography"],
  ],
  community: [
    ["Venue", "Venue & permits"],
    ["Caterer", "Food & refreshments"],
    ["Sound & stage", "Sound & stage"],
    ["Decor & lighting", "Decor & lighting"],
    ["Printer", "Publicity"],
  ],
  other: [
    ["Venue", "Venue"],
    ["Caterer", "Food"],
    ["Decorator", "Decor"],
  ],
};

/** The ceremony that falls on the event date itself; functions after it are the day after. */
const MAIN_FUNCTION = /\b(wedding|vivah|shaadi|shadi|nikah|pheras?|anand karaj|ceremony)\b/i;

/**
 * Default days from the event date for functions in the user's order (QA-14): the main ceremony
 * (the last one named like "Wedding", or else the last function) is on the event date, earlier
 * functions on the days before it, and anything after it (a reception) on the day after.
 */
export function starterDayOffsets(names: readonly string[]): number[] {
  const named = names.findLastIndex((name) => MAIN_FUNCTION.test(name));
  const main = named === -1 ? names.length - 1 : named;
  return names.map((_, i) => (i <= main ? Math.max(i - main, LIMITS.minFunctionOffset) : LIMITS.maxFunctionOffset));
}

/** Relative weight of a function by its name (MQW-09): the ceremony gets most, haldi and mehndi least. */
const FUNCTION_WEIGHTS: [RegExp, number][] = [
  [MAIN_FUNCTION, 45],
  [/\breception\b/i, 20],
  [/\b(sangeet|cocktail|garba)\b/i, 15],
];
const DEFAULT_FUNCTION_WEIGHT = 10;

/** Starter shares of the budget for functions in the user's order; unnamed kinds split evenly. */
export function starterFunctionShares(names: readonly string[]): number[] {
  const weights = names.map((name) => FUNCTION_WEIGHTS.find(([pattern]) => pattern.test(name))?.[1] ?? DEFAULT_FUNCTION_WEIGHT);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => (weight / total) * 100);
}

function planName(eventType: EventType, occasion: Occasion | null): string {
  if (occasion && occasion !== "other")
    return `${OCCASION_LABELS[occasion]} ${eventType === "community" ? "community event" : "celebration"}`;
  return eventType === "other" ? "celebration" : eventType === "community" ? "community event" : eventType;
}

/**
 * A sensible rule-based plan used when the AI is unavailable or returns
 * something unusable, so the user always gets a working plan. A festival occasion adds its own
 * notes and tasks (CO-04).
 */
export function templateDraft(input: EventInput, occasion: Occasion | null = null): AiPlanDraft {
  const offsets = starterDayOffsets(input.functions);
  const shares = starterFunctionShares(input.functions);
  const functions = input.functions.map((name, i) => ({
    name,
    dayOffset: offsets[i],
    percent: shares[i],
    highlights: [],
  }));
  const notes = (occasion && FESTIVAL_NOTES[occasion]) ?? {};

  return {
    summary: `A starter plan for a ${planName(input.eventType, occasion)} in ${input.city} for ${formatCount(input.guestCount)} guests. Edit it to suit you.`,
    budget: SPLITS[input.eventType].map((line) => ({ ...line, note: notes[line.category] ?? line.note })),
    functions,
    tasks: [...COMMON_TASKS, ...(EXTRA_TASKS[input.eventType] ?? []), ...((occasion && FESTIVAL_TASKS[occasion]) ?? [])],
    vendors: VENDORS[input.eventType].map(([category, budgetCategory]) => ({
      category,
      bookByDaysBefore: category === "Venue" ? 60 : 30,
      questions: ["What is included in the price?", "What is the cancellation policy?"],
      budgetCategory,
    })),
    ideas: [],
  };
}
