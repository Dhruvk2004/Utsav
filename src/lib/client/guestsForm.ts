import { formatCount } from "@/lib/domain/budget";
import { estimateCatering } from "@/lib/domain/catering";
import type { GuestsDoc } from "@/lib/domain/model/event";
import type { OpOf } from "@/lib/domain/ops/schema";
import { LIMITS } from "@/lib/domain/schemas";

/**
 * Guests tab (spec 5.8): counts only, never names. Code checks that adults and kids add up to the
 * total and that no count is above it, then saves one `set_guests` op.
 */

export const COUNT_FIELDS = ["adults", "kids", "elderly", "veg", "jain", "nonveg"] as const;
export type CountField = (typeof COUNT_FIELDS)[number];

export const COUNT_LABELS: Record<CountField | "total", string> = {
  total: "Total guests",
  adults: "Adults",
  kids: "Kids (under 12)",
  elderly: "Elderly (65+)",
  veg: "Vegetarian",
  jain: "Jain",
  nonveg: "Non-vegetarian",
};

export type GuestsFormValues = Record<CountField | "total" | "buffer", string>;

export function guestsFormValues(guests: GuestsDoc): GuestsFormValues {
  const text = (n: number | null) => (n === null ? "" : String(n));
  return {
    total: String(guests.total),
    adults: text(guests.adults),
    kids: text(guests.kids),
    elderly: text(guests.elderly),
    veg: text(guests.veg),
    jain: text(guests.jain),
    nonveg: text(guests.nonveg),
    buffer: String(guests.cateringBufferPercent),
  };
}

const count = (text: string): number | null => (text.trim() === "" ? null : Number(text));
const valid = (n: number | null, min: number, max: number) => n === null || (Number.isInteger(n) && n >= min && n <= max);

/** Field errors keyed by field name; empty when the counts can be saved. */
export function guestsIssues(values: GuestsFormValues): Partial<Record<keyof GuestsFormValues, string>> {
  const issues: Partial<Record<keyof GuestsFormValues, string>> = {};
  const total = count(values.total);
  if (total === null || !valid(total, LIMITS.minGuests, LIMITS.maxGuests))
    issues.total = `Enter a whole number from ${LIMITS.minGuests} to ${LIMITS.maxGuests}.`;
  for (const field of COUNT_FIELDS) {
    const n = count(values[field]);
    if (!valid(n, 0, LIMITS.maxGuests)) issues[field] = "Enter a whole number, or leave it empty.";
    else if (n !== null && total !== null && n > total) issues[field] = `Can't be more than the ${formatCount(total)} guests in total.`;
  }
  const [adults, kids] = [count(values.adults), count(values.kids)];
  if (!issues.adults && !issues.kids && total !== null && adults !== null && kids !== null && adults + kids !== total) {
    issues.kids = `Adults and kids should add up to ${total} (now ${adults + kids}).`;
  }
  if (!valid(count(values.buffer), 0, 25) || count(values.buffer) === null) issues.buffer = "Enter a buffer from 0 to 25%.";
  return issues;
}

export function guestsOp(values: GuestsFormValues): OpOf<"set_guests"> {
  const counts = Object.fromEntries(COUNT_FIELDS.map((field) => [field, count(values[field])]));
  return { type: "set_guests", guests: { total: Number(values.total), ...counts, cateringBufferPercent: Number(values.buffer) } };
}

/** "Plates: 44 (40 + 10% buffer)". */
export function cateringText(values: GuestsFormValues): string | null {
  const total = count(values.total);
  const buffer = count(values.buffer);
  if (total === null || buffer === null || !valid(total, 0, LIMITS.maxGuests) || !valid(buffer, 0, 25)) return null;
  return `Plates: ${estimateCatering(total, buffer).plates} (${total} + ${buffer}% buffer)`;
}
