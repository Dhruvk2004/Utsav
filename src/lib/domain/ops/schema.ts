import { z } from "zod";
import { WEEKDAYS } from "../dates";
import { DIETARY, DRAFT_CHANNELS, GENDERS, HONOREE_ROLES, IDEA_CATEGORIES, OCCASIONS, VENDOR_STATUSES } from "../model/enums";
import { CAPS, FUNCTION_MAX_OFFSET, FUNCTION_MIN_OFFSET, clockTime, ideaFieldsSchema, isoDate, money } from "../model/event";
import { freeMultilineText, freeText, LANGUAGES, LIMITS } from "../schemas";

/**
 * `PlanOperation` (spec 12.2): the single write language for manual edits, AI proposals
 * and code proposals. Every object is strict, so provenance fields (`origin`, `source`)
 * or any other unknown key in a payload is rejected; provenance comes from the apply context.
 */

const ref = z.string().min(1).max(80);
const name = (max: number) => freeText(max).pipe(z.string().min(1, "Enter a name"));
const daysBefore = z.number().int().min(LIMITS.minDaysBefore).max(LIMITS.maxPlanningDays);
const budgetTotal = z.number().int().min(LIMITS.minBudget).max(LIMITS.maxBudget);
const percent = z.number().min(0).max(100);
const optionalTime = clockTime.nullable().optional();
const guestCount = z.number().int().min(0).max(LIMITS.maxGuests).nullable();

const honoreeInput = z.strictObject({
  id: ref,
  role: z.enum(HONOREE_ROLES),
  name: freeText(40),
  age: z.number().int().min(0).max(120).nullable(),
  gender: z.enum(GENDERS).nullable(),
  interests: z.array(name(40)).max(CAPS.interests),
  notes: freeText(120),
});

const ideaInput = z.strictObject({
  ...ideaFieldsSchema.shape,
  title: name(80),
  description: freeText(300),
  basis: z.array(freeText(80)).max(CAPS.basis),
});

export const planOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("set_total_budget"), total: budgetTotal, strategy: z.literal("rescale") }),
  z.strictObject({
    type: z.literal("set_budget_lines"),
    lines: z
      .array(z.strictObject({ lineId: ref, amount: money, note: freeText(200).optional() }))
      .min(1)
      .max(CAPS.budgetLines),
  }),
  z.strictObject({
    type: z.literal("adjust_budget_category"),
    lineId: ref,
    mode: z.enum(["percent_change", "set_amount", "change_amount"]),
    value: z.number().finite(),
    rebalance: z.enum(["change_total", "spread_to_others", "to_contingency"]),
  }),
  z.strictObject({
    type: z.literal("add_budget_category"),
    category: name(40),
    amount: money,
    fundFrom: z.enum(["contingency", "spread", "increase_total"]),
  }),
  z.strictObject({ type: z.literal("rename_budget_category"), lineId: ref, category: name(40) }),
  z.strictObject({ type: z.literal("remove_budget_category"), lineId: ref, moveToLineId: ref.optional() }),
  z.strictObject({ type: z.literal("set_budget_note"), lineId: ref, note: freeText(200) }),
  z.strictObject({
    type: z.literal("add_function"),
    name: name(40),
    date: isoDate.optional(),
    dayOffset: z.number().int().min(FUNCTION_MIN_OFFSET).max(FUNCTION_MAX_OFFSET).optional(),
    sharePercent: percent.optional(),
    startTime: optionalTime,
    endTime: optionalTime,
  }),
  z.strictObject({
    type: z.literal("move_function"),
    functionId: ref,
    date: isoDate.optional(),
    weekday: z.enum(WEEKDAYS).optional(),
    startTime: optionalTime,
    endTime: optionalTime,
  }),
  z.strictObject({ type: z.literal("set_function_share"), functionId: ref, percent }),
  z.strictObject({ type: z.literal("rename_function"), functionId: ref, name: name(40) }),
  z.strictObject({ type: z.literal("remove_function"), functionId: ref }),
  z.strictObject({
    type: z.literal("add_task"),
    title: name(120),
    category: name(40),
    daysBefore: daysBefore.optional(),
    date: isoDate.optional(),
    functionId: ref.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("update_task"),
    taskId: ref,
    title: name(120).optional(),
    category: name(40).optional(),
    daysBefore: daysBefore.optional(),
    date: isoDate.nullable().optional(),
    done: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal("remove_task"), taskId: ref }),
  z.strictObject({
    type: z.literal("add_vendor"),
    category: name(40),
    budgetLineId: ref.nullable().optional(),
    functionIds: z.array(ref).max(CAPS.functions).optional(),
    bookByDaysBefore: z.number().int().min(0).max(LIMITS.maxPlanningDays),
    questions: z.array(name(160)).max(CAPS.questions).optional(),
  }),
  z.strictObject({
    type: z.literal("update_vendor"),
    vendorId: ref,
    patch: z.strictObject({
      label: freeText(60).optional(),
      contact: freeText(120).optional(),
      notes: freeText(1000).optional(),
      budgetLineId: ref.nullable().optional(),
      functionIds: z.array(ref).max(CAPS.functions).optional(),
      questions: z.array(name(160)).max(CAPS.questions).optional(),
      quotedAmount: money.nullable().optional(),
      paidAmount: money.optional(),
    }),
  }),
  z.strictObject({
    type: z.literal("set_vendor_status"),
    vendorId: ref,
    status: z.enum(VENDOR_STATUSES),
    quotedAmount: money.optional(),
    paidAmount: money.optional(),
  }),
  z.strictObject({ type: z.literal("remove_vendor"), vendorId: ref }),
  z.strictObject({
    type: z.literal("save_draft"),
    vendorId: ref,
    draft: z.strictObject({
      channel: z.enum(DRAFT_CHANNELS),
      language: z.enum(LANGUAGES),
      subject: freeText(120),
      body: freeMultilineText(1500).pipe(z.string().min(1)),
    }),
    generatedDraftId: ref.optional(),
  }),
  z.strictObject({ type: z.literal("remove_draft"), vendorId: ref, draftId: ref }),
  z.strictObject({ type: z.literal("add_idea"), idea: ideaInput }),
  z.strictObject({
    type: z.literal("update_idea"),
    ideaId: ref,
    patch: z.strictObject({
      title: name(80).optional(),
      description: freeText(300).optional(),
      category: z.enum(IDEA_CATEGORIES).optional(),
      estimatedCost: money.nullable().optional(),
    }),
  }),
  z.strictObject({ type: z.literal("save_idea"), ideaId: ref }),
  z.strictObject({ type: z.literal("remove_idea"), ideaId: ref, dismiss: z.boolean().optional() }),
  z.strictObject({ type: z.literal("clear_dismissed_ideas") }),
  z.strictObject({
    type: z.literal("set_guests"),
    guests: z.strictObject({
      total: z.number().int().min(LIMITS.minGuests).max(LIMITS.maxGuests).optional(),
      adults: guestCount.optional(),
      kids: guestCount.optional(),
      elderly: guestCount.optional(),
      veg: guestCount.optional(),
      jain: guestCount.optional(),
      nonveg: guestCount.optional(),
      outstation: guestCount.optional(),
      cateringBufferPercent: z.number().int().min(0).max(25).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal("set_personalisation"),
    honorees: z.array(honoreeInput).max(CAPS.honorees).optional(),
    flags: z.strictObject({ kids: z.boolean().optional(), elderly: z.boolean().optional(), mobility: z.boolean().optional() }).optional(),
    theme: freeText(LIMITS.maxTextLength).optional(),
    tradition: z.array(name(40)).max(6).optional(),
    traditionOther: freeText(60).optional(),
    dietary: z.array(z.enum(DIETARY)).optional(),
    vibe: freeText(LIMITS.maxTextLength).optional(),
  }),
  z.strictObject({
    type: z.literal("set_details"),
    title: freeText(80).optional(),
    eventDate: isoDate.optional(),
    city: name(60).optional(),
    language: z.enum(LANGUAGES).optional(),
    occasion: z.enum(OCCASIONS).nullable().optional(),
    occasionOther: freeText(60).optional(),
    milestone: z.number().int().min(0).max(120).nullable().optional(),
  }),
  z.strictObject({ type: z.literal("set_summary"), text: freeText(600) }),
  z.strictObject({ type: z.literal("reset_section"), section: z.enum(["budget", "timeline", "vendors", "ideas"]) }),
]);

export type PlanOperation = z.output<typeof planOperationSchema>;
export type PlanOperationInput = z.input<typeof planOperationSchema>;
export type OpType = PlanOperation["type"];
export type OpOf<T extends OpType> = Extract<PlanOperation, { type: T }>;

/** Op types that AI and code-generated proposals may carry (the 6.1 Edit-forms table). */
export const PROPOSABLE_OP_TYPES = [
  "adjust_budget_category",
  "add_budget_category",
  "remove_budget_category",
  "set_budget_note",
  "set_total_budget",
  "set_budget_lines",
  "add_function",
  "move_function",
  "set_function_share",
  "remove_function",
  "add_task",
  "update_task",
  "remove_task",
  "add_vendor",
  "update_vendor",
  "set_vendor_status",
  "remove_vendor",
  "add_idea",
  "set_guests",
  "set_details",
  "reset_section",
] as const satisfies readonly OpType[];
export type ProposableOpType = (typeof PROPOSABLE_OP_TYPES)[number];

export function isProposable(op: PlanOperation): op is Extract<PlanOperation, { type: ProposableOpType }> {
  return (PROPOSABLE_OP_TYPES as readonly string[]).includes(op.type);
}

/** The op union restricted to proposable types, used for demo `appliedOps` (spec 5.10). */
export const proposableOperationSchema = planOperationSchema.refine(isProposable, "Not a proposable change");
