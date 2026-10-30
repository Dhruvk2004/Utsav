import type { BudgetStyle, Dietary, Occasion } from "./model/enums";
import type { IdeaFields } from "./model/event";

/**
 * Personalisation rule inputs (spec section 7) as data, plus the small pure lookups that
 * prompt builders, the idea library and output checks share.
 */

export type Touchpoint = "T1" | "T2" | "T4" | "T5";

/** The keys an idea's `basis` may cite (7.1); anything else is dropped by `filterBasis`. */
export const BASIS_INPUTS: readonly { key: string; label: string; usedBy: readonly Touchpoint[] }[] = [
  { key: "details.eventType", label: "event type", usedBy: ["T1", "T4"] },
  { key: "details.occasion", label: "occasion", usedBy: ["T1", "T4", "T5"] },
  { key: "details.milestone", label: "milestone", usedBy: ["T1", "T4"] },
  { key: "functions", label: "functions", usedBy: ["T1", "T2", "T4"] },
  { key: "date.season", label: "season", usedBy: ["T1", "T4"] },
  { key: "date.leadTime", label: "time to go", usedBy: ["T1", "T4"] },
  { key: "date.festival", label: "festival nearby", usedBy: ["T1", "T4"] },
  { key: "city", label: "city", usedBy: ["T1", "T4", "T5"] },
  { key: "guests.total", label: "guest count", usedBy: ["T1", "T4"] },
  { key: "guests.kids", label: "kids", usedBy: ["T1", "T4"] },
  { key: "guests.elderly", label: "elderly guests", usedBy: ["T1", "T4"] },
  { key: "flags.mobility", label: "mobility needs", usedBy: ["T1", "T4"] },
  { key: "budget.perGuest", label: "budget per guest", usedBy: ["T1", "T4"] },
  { key: "details.vibe", label: "vibe", usedBy: ["T1", "T4"] },
  { key: "details.theme", label: "theme", usedBy: ["T1", "T4"] },
  { key: "details.tradition", label: "tradition", usedBy: ["T1", "T4", "T5"] },
  { key: "details.traditionOther", label: "tradition", usedBy: ["T1", "T4", "T5"] },
  { key: "details.dietary", label: "dietary needs", usedBy: ["T1", "T4"] },
  { key: "honoree.role", label: "who it's for", usedBy: ["T4"] },
  { key: "honoree.age", label: "age", usedBy: ["T4"] },
  { key: "honoree.gender", label: "gender", usedBy: ["T4"] },
  { key: "honoree.interests", label: "interests", usedBy: ["T4"] },
  { key: "profile.role", label: "your role", usedBy: ["T1", "T4"] },
  { key: "profile.budgetStyle", label: "budget style", usedBy: ["T1", "T4"] },
];

const BASIS_KEYS = new Set(BASIS_INPUTS.map((input) => input.key));

/** Keeps basis entries that cite a known input, as `key` or `key:value`. */
export function filterBasis(basis: string[]): string[] {
  return basis.filter((entry) => BASIS_KEYS.has(entry.split(":")[0].trim()));
}

/** Per-guest spend tiers (7.1); ideas must fit the tier. */
export const BUDGET_TIERS = [
  { id: "simple", below: 500 },
  { id: "standard", below: 1_500 },
  { id: "premium", below: 4_000 },
  { id: "luxury", below: Number.POSITIVE_INFINITY },
] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number]["id"];

export function budgetTier(perGuest: number): BudgetTier {
  return BUDGET_TIERS.find((tier) => perGuest < tier.below)?.id ?? "luxury";
}

/** Age bands for honorees (7.1). */
export const AGE_BANDS = ["0-2", "3-5", "6-9", "10-12", "13-17", "18-29", "30-59", "60+"] as const;
const AGE_BAND_STARTS = [0, 3, 6, 10, 13, 18, 30, 60];

export function ageBand(age: number): (typeof AGE_BANDS)[number] {
  const index = AGE_BAND_STARTS.findLastIndex((start) => age >= start);
  return AGE_BANDS[Math.max(0, index)];
}

/** Birthday ages that get milestone ideas, and named wedding anniversaries (7.1). */
export const BIRTHDAY_MILESTONES = [1, 16, 18, 21, 30, 50, 60, 75, 80] as const;
export const ANNIVERSARY_MILESTONES: Readonly<Record<number, string>> = {
  1: "paper",
  10: "tenth",
  25: "silver",
  40: "ruby",
  50: "golden",
  60: "diamond",
};

/** Occasion-specific idea families, explicit rather than guessed from the date (7.1). */
export const OCCASION_IDEAS: Readonly<Record<Occasion, readonly string[]>> = {
  diwali: ["rangoli competition", "diya painting", "green-cracker alternatives"],
  ganesh_chaturthi: ["eco clay idol", "aarti schedule", "artificial tank immersion"],
  holi: ["natural colours", "water-saving play zone", "thandai counter"],
  navratri: ["garba night", "dandiya workshop", "nine-colour dress code"],
  eid: ["sheer khurma counter", "mehndi corner", "eidi envelopes for kids"],
  christmas: ["carol singing", "secret santa", "plum cake stall"],
  independence_day: ["flag hoisting", "fancy dress", "tricolour food counter"],
  republic_day: ["flag hoisting", "fancy dress", "quiz"],
  housewarming: ["puja checklist", "toran", "plant return gifts"],
  naming_ceremony: ["cradle decor", "name-reveal board", "family blessing tree"],
  other: [],
};

/** Default contingency share by budget comfort (spec 4.2). */
export const CONTINGENCY_PERCENT: Readonly<Record<BudgetStyle, number>> = { simple: 10, balanced: 8, all_out: 5 };

/** Ingredients that may not suit a dietary need; food ideas mentioning them are flagged, not hidden (7.3). */
export const DIETARY_BLOCKLIST: Partial<Record<Dietary, readonly string[]>> = {
  jain: ["onion", "garlic", "potato", "carrot", "beetroot"],
  no_onion_garlic: ["onion", "garlic"],
};

const DIETARY_LABELS: Partial<Record<Dietary, string>> = { jain: "Jain guests", no_onion_garlic: "guests avoiding onion and garlic" };

export function dietaryWarning(idea: Pick<IdeaFields, "category" | "title" | "description">, dietary: Dietary[]): string | null {
  if (idea.category !== "food") return null;
  const text = `${idea.title} ${idea.description}`.toLowerCase();
  for (const need of dietary) {
    const blocked = DIETARY_BLOCKLIST[need];
    if (blocked?.some((word) => text.includes(word))) return `May not suit ${DIETARY_LABELS[need]}`;
  }
  return null;
}

/** Metro cities get the higher cost band passed to the model as `costBand` (7.1). */
export const METRO_CITIES = [
  "mumbai",
  "delhi",
  "new delhi",
  "bengaluru",
  "bangalore",
  "chennai",
  "kolkata",
  "hyderabad",
  "pune",
  "gurugram",
  "noida",
  "ahmedabad",
] as const;

export function costBand(city: string): "metro" | "standard" {
  return (METRO_CITIES as readonly string[]).includes(city.trim().toLowerCase()) ? "metro" : "standard";
}

/** Indian seasons by month, for `date.season`. */
export function seasonOf(isoDate: string): "winter" | "summer" | "monsoon" | "autumn" {
  const month = Number(isoDate.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "summer";
  return month <= 9 ? "monsoon" : "autumn";
}
