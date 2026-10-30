import { formatCount } from "../budget";
import { addDays, daysBetween, validateEventDate } from "../dates";
import type { EventDoc, GuestsDoc } from "../model/event";
import { LIMITS } from "../schemas";
import { defined, fail, itemOrigin, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/** Guests, personalisation, details and summary ops (spec 5.7, 5.8, 5.9). */

const GUEST_LABELS: Record<Exclude<keyof GuestsDoc, "total" | "cateringBufferPercent">, string> = {
  adults: "Adults",
  kids: "Kids",
  elderly: "Elderly guests",
  veg: "Vegetarian guests",
  jain: "Jain guests",
  nonveg: "Non-vegetarian guests",
  outstation: "Outstation guests",
};

/** Kids and elderly counts, when set, decide the matching flags (invariant 12). */
export function syncGuestFlags(plan: EventDoc): void {
  if (plan.guests.kids !== null) plan.flags.kids = plan.guests.kids > 0;
  if (plan.guests.elderly !== null) plan.flags.elderly = plan.guests.elderly > 0;
}

export function setGuests(plan: EventDoc, op: OpOf<"set_guests">): void {
  const guests: GuestsDoc = { ...plan.guests, ...defined(op.guests) };
  for (const [key, label] of Object.entries(GUEST_LABELS)) {
    const value = guests[key as keyof typeof GUEST_LABELS];
    if (value !== null && value > guests.total) fail(`${label} can't be more than the ${formatCount(guests.total)} guests in total`);
  }
  if (guests.adults !== null && guests.kids !== null && guests.adults + guests.kids !== guests.total) {
    fail(`Adults and kids should add up to ${formatCount(guests.total)}`);
  }
  plan.guests = guests;
  syncGuestFlags(plan);
}

export function setPersonalisation(plan: EventDoc, op: OpOf<"set_personalisation">): void {
  const { flags, honorees, theme, tradition, traditionOther, dietary, vibe } = op;
  if (flags?.kids !== undefined && plan.guests.kids !== null && flags.kids !== plan.guests.kids > 0) {
    fail("Kids are counted in the Guests tab");
  }
  if (flags?.elderly !== undefined && plan.guests.elderly !== null && flags.elderly !== plan.guests.elderly > 0) {
    fail("Elderly guests are counted in the Guests tab");
  }
  if (honorees && new Set(honorees.map((h) => h.id)).size !== honorees.length) fail("Each person needs their own entry");
  Object.assign(plan.details, defined({ theme, tradition, traditionOther, dietary, vibe }));
  if (honorees) plan.honorees = honorees;
  if (flags) Object.assign(plan.flags, defined(flags));
}

function checkMilestone(eventType: EventDoc["details"]["eventType"], milestone: number | null): void {
  if (milestone === null) return;
  if (eventType === "birthday") return;
  if (eventType === "anniversary" && milestone >= 1 && milestone <= 80) return;
  fail(eventType === "anniversary" ? "Years married must be between 1 and 80" : "Milestones apply to birthdays and anniversaries");
}

/** Moves the event: functions keep their offset from the day; pinned tasks keep their date when they still fit. */
function moveEventDate(plan: EventDoc, eventDate: string, today: string): void {
  const problem = validateEventDate(eventDate, today);
  if (problem) fail(problem);
  const shift = daysBetween(plan.details.eventDate, eventDate);
  for (const fn of plan.functions) {
    const date = addDays(fn.date, shift);
    if (shift !== 0 && date < today) fail(`That would move ${fn.name} into the past`);
    fn.date = date;
  }
  for (const task of plan.tasks) {
    if (task.pinnedDate === null) continue;
    const daysBefore = daysBetween(task.pinnedDate, eventDate);
    if (daysBefore < LIMITS.minDaysBefore || daysBefore > LIMITS.maxPlanningDays) {
      // The pin no longer fits the new date window, so the task falls back to the nearest relative slot.
      task.pinnedDate = null;
      task.daysBefore = Math.min(LIMITS.maxPlanningDays, Math.max(LIMITS.minDaysBefore, daysBefore));
    } else task.daysBefore = daysBefore;
  }
  plan.details.eventDate = eventDate;
}

export function setDetails(plan: EventDoc, op: OpOf<"set_details">, ctx: ApplyContext): void {
  const { eventDate, title, city, language, occasion, occasionOther, milestone } = op;
  const fields = defined({ title, city, language, occasion, occasionOther, milestone });
  if (ctx.actor === "ai" && Object.keys(fields).length > 0) fail("Only the event date can be suggested");
  const { eventType } = plan.details;
  if (occasion && eventType !== "community" && eventType !== "other") {
    fail("Occasions apply to community and other events");
  }
  if (milestone !== undefined) checkMilestone(eventType, milestone);
  if (eventDate !== undefined && eventDate !== plan.details.eventDate) moveEventDate(plan, eventDate, ctx.today);
  Object.assign(plan.details, fields);
}

export function setSummary(plan: EventDoc, op: OpOf<"set_summary">, ctx: ApplyContext): void {
  plan.summary = { text: op.text, origin: itemOrigin(ctx) };
}
