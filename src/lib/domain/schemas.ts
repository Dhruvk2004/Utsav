import { z } from "zod";
import { IDEA_CATEGORIES } from "./model/enums";

/** Event types the planner understands. */
export const EVENT_TYPES = ["wedding", "birthday", "anniversary", "community", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const LANGUAGES = ["en", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LIMITS = {
  minGuests: 1,
  maxGuests: 5000,
  minBudget: 1_000,
  maxBudget: 100_000_000,
  maxFunctions: 8,
  maxTextLength: 200,
  maxPlanningDays: 730,
  /** Tasks may fall up to a week after the event (negative days before), e.g. thank-you messages. */
  minDaysBefore: -7,
  /** Functions run from two weeks before the event to the day after (spec 8.2). */
  minFunctionOffset: -14,
  maxFunctionOffset: 1,
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Bidirectional embedding, override and isolate controls and the invisible direction marks. They
 * can reorder how text displays ("Pune \u202Etxt.exe"), so they are removed (SEC-08). The zero-width
 * joiners that Indic scripts and emoji need are kept.
 */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Strips control and bidi characters and collapses whitespace so free text is safe to store and prompt with. */
export function cleanText(value: string): string {
  return value
    .replace(BIDI_CONTROLS, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `cleanText` for multi-line text (message drafts): line breaks are kept, as `\n`. */
export function cleanMultilineText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(BIDI_CONTROLS, "")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .trim();
}

export const freeText = (max: number) => z.string().transform(cleanText).pipe(z.string().max(max));
export const freeMultilineText = (max: number) => z.string().transform(cleanMultilineText).pipe(z.string().max(max));

export const eventInputSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  title: freeText(80).optional().default(""),
  eventDate: z
    .string()
    .regex(ISO_DATE, "Use the format YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Enter a real calendar date"),
  city: freeText(60).pipe(z.string().min(2, "Enter the city")),
  guestCount: z.coerce
    .number()
    .int("Guest count must be a whole number")
    .min(LIMITS.minGuests, `At least ${LIMITS.minGuests} guest`)
    .max(LIMITS.maxGuests, `At most ${LIMITS.maxGuests.toLocaleString("en-IN")} guests`),
  budget: z.coerce
    .number()
    .int("Budget must be a whole number of rupees")
    .min(LIMITS.minBudget, `Budget must be at least ₹${LIMITS.minBudget.toLocaleString("en-IN")}`)
    .max(LIMITS.maxBudget, "Budget is too large"),
  vibe: freeText(LIMITS.maxTextLength).optional().default(""),
  functions: z
    .array(freeText(40).pipe(z.string().min(1)))
    .max(LIMITS.maxFunctions, `At most ${LIMITS.maxFunctions} functions`)
    .optional()
    .default([]),
  language: z.enum(LANGUAGES).optional().default("en"),
});

export type EventInput = z.output<typeof eventInputSchema>;
export type EventInputDraft = z.input<typeof eventInputSchema>;

/** Maps an older draft function's `daysBeforeEvent` (days before, 0..14) to the signed `dayOffset`. */
function legacyDayOffset(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("daysBeforeEvent" in value) || "dayOffset" in value) return value;
  const { daysBeforeEvent, ...rest } = value as Record<string, unknown>;
  return { ...rest, dayOffset: typeof daysBeforeEvent === "number" ? -daysBeforeEvent || 0 : daysBeforeEvent };
}

/**
 * Shape Gemini must return. Amounts are expressed as percentages and days-before offsets;
 * rupee amounts and calendar dates are always computed in code, never trusted from the model.
 */
export const aiPlanDraftSchema = z.object({
  summary: z.string().min(1).max(600),
  budget: z
    .array(
      z.object({
        category: z.string().min(1).max(40),
        percent: z.number().min(0).max(100),
        note: z.string().max(200).default(""),
      }),
    )
    .min(1)
    .max(12),
  functions: z
    .array(
      z.preprocess(
        legacyDayOffset,
        z.object({
          name: z.string().min(1).max(40),
          /** Days from the event date: -14 (two weeks before) to +1 (a reception the day after). */
          dayOffset: z.number().int().min(LIMITS.minFunctionOffset).max(LIMITS.maxFunctionOffset),
          percent: z.number().min(0).max(100),
          highlights: z.array(z.string().max(120)).max(5).default([]),
        }),
      ),
    )
    .max(LIMITS.maxFunctions)
    .default([]),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        category: z.string().min(1).max(40),
        daysBefore: z.number().int().min(LIMITS.minDaysBefore).max(LIMITS.maxPlanningDays),
      }),
    )
    .min(1)
    .max(40),
  vendors: z
    .array(
      z.object({
        category: z.string().min(1).max(40),
        bookByDaysBefore: z.number().int().min(0).max(LIMITS.maxPlanningDays),
        questions: z.array(z.string().max(160)).max(5).default([]),
        /** The budget line this vendor is paid from, by category name. */
        budgetCategory: z.string().max(40).nullable().default(null),
      }),
    )
    .min(1)
    .max(15),
  ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().max(300),
        estimatedCost: z.number().int().min(0).nullable().default(null),
        category: z.enum(IDEA_CATEGORIES).default("experience"),
        /** Which inputs the idea used ("Theme: jungle"), shown as "Why this idea". */
        basis: z.array(z.string().max(80)).max(5).default([]),
      }),
    )
    .max(10)
    .default([]),
});

export type AiPlanDraft = z.output<typeof aiPlanDraftSchema>;

export interface BudgetLine {
  category: string;
  amount: number;
  percent: number;
  note: string;
}

export interface PlannedFunction {
  name: string;
  date: string;
  amount: number;
  highlights: string[];
}

export interface TimelineTask {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  daysBefore: number;
  /** True when the ideal date has already passed and the task was pulled forward to today. */
  rushed: boolean;
}

export interface VendorItem {
  id: string;
  category: string;
  bookBy: string;
  bookByDaysBefore: number;
  rushed: boolean;
  questions: string[];
  budgetCategory: string | null;
}

export interface Idea {
  title: string;
  description: string;
  /** Always an AI estimate, never a quoted vendor price. */
  estimatedCost: number | null;
  category: (typeof IDEA_CATEGORIES)[number];
  basis: string[];
}

export interface CateringEstimate {
  plates: number;
  bufferPercent: number;
}

export interface EventPlan {
  input: EventInput;
  generatedAt: string;
  source: "ai" | "template";
  summary: string;
  budget: { total: number; lines: BudgetLine[] };
  functions: PlannedFunction[];
  timeline: TimelineTask[];
  vendors: VendorItem[];
  ideas: Idea[];
  catering: CateringEstimate;
  warnings: string[];
}
