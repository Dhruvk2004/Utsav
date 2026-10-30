import { z } from "zod";
import { addDays, daysBetween, formatDisplayDate } from "../dates";
import { EVENT_TYPES, freeText, LANGUAGES, LIMITS } from "../schemas";
import { DIETARY, GENDERS, HONOREE_ROLES, OCCASIONS, TRADITIONS } from "./enums";
import { CAPS, clockTime, flagsSchema, FUNCTION_MAX_OFFSET, FUNCTION_MIN_OFFSET, isoDate, type EventDetails } from "./event";
import { MAX_TRADITIONS } from "./user";

/**
 * The event creation request (spec 5.1, `POST /api/events`). The wizard validates with this schema
 * on the client and the server validates again with the same schema; rules that depend on today's
 * date are in `createEventDateIssues`. Messages are written for people, because the wizard shows
 * them as they are.
 */

export const PLAN_MODES = ["ai", "blank"] as const;
export type PlanMode = (typeof PLAN_MODES)[number];

export const MILESTONE_RANGES = {
  birthday: { min: 0, max: 120, message: "Enter an age from 0 to 120." },
  anniversary: { min: 1, max: 80, message: "Enter between 1 and 80 years." },
} as const;

const GUESTS_MESSAGE = `Enter between ${LIMITS.minGuests} and ${LIMITS.maxGuests.toLocaleString("en-IN")} guests.`;
const BUDGET_MESSAGE = `Enter between ₹${LIMITS.minBudget.toLocaleString("en-IN")} and ₹${LIMITS.maxBudget.toLocaleString("en-IN")}.`;
const SHARE_MESSAGE = "Enter a share from 1 to 100%.";

const wholeNumber = (min: number, max: number, message: string) =>
  z.number({ error: message }).int({ error: message }).min(min, { error: message }).max(max, { error: message });

export const functionInputSchema = z
  .object({
    name: freeText(40).pipe(z.string().min(1, "Add a name.")),
    date: isoDate.nullable(),
    startTime: clockTime.nullable(),
    endTime: clockTime.nullable(),
    sharePercent: wholeNumber(1, 100, SHARE_MESSAGE).nullable(),
  })
  .strict()
  .refine((f) => !f.startTime || !f.endTime || f.endTime > f.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  });

export const honoreeInputSchema = z
  .object({
    role: z.enum(HONOREE_ROLES),
    name: freeText(40),
    age: wholeNumber(0, 120, "Enter an age from 0 to 120.").nullable(),
    gender: z.enum(GENDERS).nullable(),
    interests: z.array(freeText(40).pipe(z.string().min(1))).max(CAPS.interests, `Add up to ${CAPS.interests} interests.`),
    notes: freeText(120),
  })
  .strict();

export const createEventSchema = z
  .object({
    mode: z.enum(PLAN_MODES),
    eventType: z.enum(EVENT_TYPES),
    title: freeText(80),
    occasion: z.enum(OCCASIONS).nullable(),
    occasionOther: freeText(60),
    milestone: wholeNumber(0, 120, "Enter a whole number.").nullable(),
    eventDate: z.string().refine((d) => isoDate.safeParse(d).success, "Pick the event date."),
    city: freeText(60).pipe(z.string().min(2, "Enter the city.")),
    guestCount: wholeNumber(LIMITS.minGuests, LIMITS.maxGuests, GUESTS_MESSAGE),
    budget: wholeNumber(LIMITS.minBudget, LIMITS.maxBudget, BUDGET_MESSAGE),
    functions: z.array(functionInputSchema).max(LIMITS.maxFunctions, `Add up to ${LIMITS.maxFunctions} parts.`),
    vibe: freeText(LIMITS.maxTextLength),
    theme: freeText(LIMITS.maxTextLength),
    tradition: z.array(z.enum(TRADITIONS)).max(MAX_TRADITIONS, `Choose up to ${MAX_TRADITIONS} traditions.`),
    traditionOther: freeText(60),
    dietary: z.array(z.enum(DIETARY)).max(DIETARY.length),
    honorees: z.array(honoreeInputSchema).max(CAPS.honorees, `Add up to ${CAPS.honorees} people.`),
    flags: flagsSchema,
    language: z.enum(LANGUAGES),
  })
  .strict()
  .superRefine((input, ctx) => {
    for (const issue of createEventRuleIssues(input)) ctx.addIssue({ code: "custom", ...issue });
  });

export type CreateEventInput = z.input<typeof createEventSchema>;
export type CreateEventRequest = z.output<typeof createEventSchema>;
export type FunctionInput = z.input<typeof functionInputSchema>;
export type HonoreeInput = z.input<typeof honoreeInputSchema>;

export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Rules across fields: the milestone range by event type, occasion only for community and other
 * events, and explicit shares that fit in 100%. Exported so the wizard can show them while other
 * fields are still incomplete.
 */
export function createEventRuleIssues(input: Pick<CreateEventInput, "eventType" | "milestone" | "occasion" | "functions">): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const { eventType, milestone, occasion } = input;
  if (milestone !== null && milestone !== undefined) {
    const range = eventType === "birthday" || eventType === "anniversary" ? MILESTONE_RANGES[eventType] : null;
    if (!range) issues.push({ path: ["milestone"], message: "Only birthdays and anniversaries have a milestone." });
    else if (milestone < range.min || milestone > range.max) issues.push({ path: ["milestone"], message: range.message });
  }
  if (occasion && eventType !== "community" && eventType !== "other") {
    issues.push({ path: ["occasion"], message: "Only community and other events have an occasion." });
  }
  const shares = input.functions.reduce((sum, f) => sum + (f.sharePercent ?? 0), 0);
  if (shares > 100) issues.push({ path: ["functions"], message: "Shares add up to more than 100%." });
  return issues;
}

/** The date window for a part of the event: up to 14 days before and 1 day after, never before today. */
export function functionDateWindow(eventDate: string, today: string): { from: string; to: string } {
  const earliest = addDays(eventDate, FUNCTION_MIN_OFFSET);
  return { from: earliest < today ? today : earliest, to: addDays(eventDate, FUNCTION_MAX_OFFSET) };
}

/** Rules that depend on today: the event date (today to today + 730) and each part's date window. */
export function createEventDateIssues(input: Pick<CreateEventInput, "eventDate" | "functions">, today: string): FieldIssue[] {
  const { eventDate } = input;
  if (!isoDate.safeParse(eventDate).success) return [];
  const lead = daysBetween(today, eventDate);
  if (lead < 0 || lead > LIMITS.maxPlanningDays) {
    const last = addDays(today, LIMITS.maxPlanningDays);
    return [
      {
        path: ["eventDate"],
        message: `Pick a date from today (${formatDisplayDate(today)}) to ${formatDisplayDate(last)}.`,
      },
    ];
  }
  const { from, to } = functionDateWindow(eventDate, today);
  return input.functions.flatMap((f, i) =>
    f.date && (f.date < from || f.date > to)
      ? [{ path: ["functions", i, "date"], message: `Pick a date from ${formatDisplayDate(from)} to ${formatDisplayDate(to)}.` }]
      : [],
  );
}

/** The details stored for a new event (spec 8.2), before any plan is generated. */
export function detailsFromRequest(request: CreateEventRequest): EventDetails {
  return {
    eventType: request.eventType,
    title: request.title,
    occasion: request.occasion,
    occasionOther: request.occasionOther,
    milestone: request.milestone,
    eventDate: request.eventDate,
    city: request.city,
    language: request.language,
    vibe: request.vibe,
    theme: request.theme,
    tradition: request.tradition,
    traditionOther: request.traditionOther,
    dietary: request.dietary,
  };
}
