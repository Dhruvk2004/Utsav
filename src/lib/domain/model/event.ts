import { z } from "zod";
import { isValidTime } from "../dates";
import { EVENT_TYPES, LANGUAGES, LIMITS } from "../schemas";
import {
  COST_BASES,
  DIETARY,
  DRAFT_CHANNELS,
  DRAFT_ORIGINS,
  EFFORTS,
  EVENT_STATUSES,
  GENDERS,
  HONOREE_ROLES,
  IDEA_CATEGORIES,
  IDEA_SOURCES,
  IDEA_STATES,
  OCCASIONS,
  ORIGINS,
  PLAN_SOURCES,
  REVIEW_STATES,
  VENDOR_STATUSES,
} from "./enums";

/**
 * Stored event document (`events/{eventId}`, spec 8.2). Timestamps are ISO-8601 UTC
 * strings in the domain layer; the Firestore adapter converts them to and from Timestamp.
 */

/** Array caps from spec 8.1 and 8.4 (invariant 8). */
export const CAPS = {
  budgetLines: 20,
  functions: LIMITS.maxFunctions,
  tasks: 150,
  vendors: 40,
  ideas: 60,
  dismissedIdeaTitles: 50,
  honorees: 4,
  interests: 8,
  questions: 8,
  vendorHistory: 20,
  drafts: 3,
  highlights: 5,
  basis: 10,
} as const;

export const FUNCTION_MIN_OFFSET = LIMITS.minFunctionOffset;
export const FUNCTION_MAX_OFFSET = LIMITS.maxFunctionOffset;

export const isoDate = z.iso.date();
export const isoDateTime = z.iso.datetime();
export const clockTime = z.string().refine(isValidTime, "Use the 24-hour format HH:mm");
export const money = z.number().int().min(0);
const id = z.string().min(1).max(80);
const text = (max: number) => z.string().max(max);

export const detailsSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  title: text(80),
  occasion: z.enum(OCCASIONS).nullable(),
  occasionOther: text(60),
  milestone: z.number().int().min(0).max(120).nullable(),
  eventDate: isoDate,
  city: text(60),
  language: z.enum(LANGUAGES),
  vibe: text(LIMITS.maxTextLength),
  theme: text(LIMITS.maxTextLength),
  tradition: z.array(text(40)).max(6),
  traditionOther: text(60),
  dietary: z.array(z.enum(DIETARY)),
});

export const budgetLineSchema = z.object({
  id,
  category: text(40).min(1),
  amount: money,
  percent: z.number().min(0).max(100),
  note: text(200),
  origin: z.enum(ORIGINS),
  pinned: z.boolean().optional(),
});

export const functionSchema = z.object({
  id,
  name: text(40).min(1),
  date: isoDate,
  startTime: clockTime.nullable(),
  endTime: clockTime.nullable(),
  sharePercent: z.number().min(0).max(100),
  amount: money,
  highlights: z.array(text(120)).max(CAPS.highlights),
  headcount: z.number().int().min(0).optional(),
  origin: z.enum(ORIGINS),
});

export const taskSchema = z.object({
  id,
  title: text(120).min(1),
  category: text(40).min(1),
  daysBefore: z.number().int().min(LIMITS.minDaysBefore).max(LIMITS.maxPlanningDays),
  pinnedDate: isoDate.nullable(),
  functionId: id.nullable(),
  done: z.boolean(),
  doneAt: isoDateTime.nullable(),
  origin: z.enum(ORIGINS),
});

export const draftSchema = z.object({
  id,
  channel: z.enum(DRAFT_CHANNELS),
  language: z.enum(LANGUAGES),
  subject: text(120),
  body: text(1500).min(1),
  createdAt: isoDateTime,
  origin: z.enum(DRAFT_ORIGINS),
});

export const vendorSchema = z.object({
  id,
  category: text(40).min(1),
  label: text(60),
  budgetLineId: id.nullable(),
  functionIds: z.array(id).max(CAPS.functions),
  bookByDaysBefore: z.number().int().min(0).max(LIMITS.maxPlanningDays),
  status: z.enum(VENDOR_STATUSES),
  quotedAmount: money.nullable(),
  paidAmount: money,
  notes: text(1000),
  contact: text(120),
  questions: z.array(text(160)).max(CAPS.questions),
  history: z.array(z.object({ status: z.enum(VENDOR_STATUSES), at: isoDateTime })).max(CAPS.vendorHistory),
  drafts: z.array(draftSchema).max(CAPS.drafts),
  origin: z.enum(ORIGINS),
});

export const ideaFieldsSchema = z.object({
  title: text(80).min(1),
  description: text(300),
  category: z.enum(IDEA_CATEGORIES),
  estimatedCost: money.nullable(),
  costBasis: z.enum(COST_BASES),
  basis: z.array(text(80)).max(CAPS.basis),
  effort: z.enum(EFFORTS),
});

export const ideaSchema = ideaFieldsSchema.extend({
  id,
  state: z.enum(IDEA_STATES),
  origin: z.enum(ORIGINS),
  source: z.enum(IDEA_SOURCES),
});

const count = z.number().int().min(0).max(LIMITS.maxGuests).nullable();

export const guestsSchema = z.object({
  total: z.number().int().min(LIMITS.minGuests).max(LIMITS.maxGuests),
  adults: count,
  kids: count,
  elderly: count,
  veg: count,
  jain: count,
  nonveg: count,
  outstation: count,
  cateringBufferPercent: z.number().int().min(0).max(25),
});

export const honoreeSchema = z.object({
  id,
  role: z.enum(HONOREE_ROLES),
  name: text(40),
  age: z.number().int().min(0).max(120).nullable(),
  gender: z.enum(GENDERS).nullable(),
  interests: z.array(text(40).min(1)).max(CAPS.interests),
  notes: text(120),
});

export const flagsSchema = z.object({ kids: z.boolean(), elderly: z.boolean(), mobility: z.boolean() });

const reviewState = z.enum(REVIEW_STATES);
export const reviewSchema = z.object({ budget: reviewState, timeline: reviewState, vendors: reviewState, ideas: reviewState }).nullable();

export const statsSchema = z.object({
  tasksDone: z.number().int().min(0),
  tasksTotal: z.number().int().min(0),
  openDueDates: z.array(isoDate).max(CAPS.tasks),
  vendorsByStatus: z.record(z.enum(VENDOR_STATUSES), z.number().int().min(0)),
  committed: money,
  pending: z.object({ count: z.number().int().min(0), expireAt: isoDateTime.nullable() }),
});

export const eventDocSchema = z.object({
  ownerUid: z.string().min(1),
  version: z.number().int().min(0),
  schemaVersion: z.literal(1),
  status: z.enum(EVENT_STATUSES),
  source: z.enum(PLAN_SOURCES),
  details: detailsSchema,
  summary: z.object({ text: text(600), origin: z.enum(ORIGINS) }),
  budget: z.object({ total: money, lines: z.array(budgetLineSchema).max(CAPS.budgetLines) }),
  functions: z.array(functionSchema).max(CAPS.functions),
  tasks: z.array(taskSchema).max(CAPS.tasks),
  vendors: z.array(vendorSchema).max(CAPS.vendors),
  ideas: z.array(ideaSchema).max(CAPS.ideas),
  dismissedIdeaTitles: z.array(text(80)).max(CAPS.dismissedIdeaTitles),
  guests: guestsSchema,
  honorees: z.array(honoreeSchema).max(CAPS.honorees),
  flags: flagsSchema,
  review: reviewSchema,
  warnings: z.array(z.string()),
  share: z.object({
    active: z.boolean(),
    tokenHash: z.string().nullable(),
    showAmounts: z.boolean(),
    showNotes: z.boolean(),
  }),
  stats: statsSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export type EventDoc = z.infer<typeof eventDocSchema>;
export type EventDetails = EventDoc["details"];
export type BudgetLineDoc = z.infer<typeof budgetLineSchema>;
export type FunctionDoc = z.infer<typeof functionSchema>;
export type TaskDoc = z.infer<typeof taskSchema>;
export type VendorDoc = z.infer<typeof vendorSchema>;
export type DraftDoc = z.infer<typeof draftSchema>;
export type IdeaFields = z.infer<typeof ideaFieldsSchema>;
export type IdeaDoc = z.infer<typeof ideaSchema>;
export type GuestsDoc = z.infer<typeof guestsSchema>;
export type HonoreeDoc = z.infer<typeof honoreeSchema>;
export type Flags = z.infer<typeof flagsSchema>;
export type PlanStats = z.infer<typeof statsSchema>;
