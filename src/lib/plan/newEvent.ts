import { EMPTY_CONTEXT, type PlanContext } from "@/lib/ai/prompts/plan";
import { allocate } from "@/lib/domain/budget";
import { assertPlanInvariants } from "@/lib/domain/invariants";
import { buildPlan } from "@/lib/domain/planner";
import { REVIEW_SECTIONS, type PLAN_SOURCES } from "@/lib/domain/model/enums";
import { detailsFromRequest, type CreateEventRequest } from "@/lib/domain/model/createEvent";
import type { BudgetLineDoc, EventDoc, FunctionDoc, IdeaDoc, TaskDoc, VendorDoc } from "@/lib/domain/model/event";
import type { HistoryDoc } from "@/lib/domain/model/records";
import type { UserDoc } from "@/lib/domain/model/user";
import { finalizePlan } from "@/lib/domain/ops/apply";
import { nameKey, uniqueId } from "@/lib/domain/ops/context";
import { CONTINGENCY_PERCENT, filterBasis } from "@/lib/domain/personalisation";
import type { EventInput, EventPlan } from "@/lib/domain/schemas";
import { templateDraft } from "@/lib/domain/template";
import { CREATED_VERSION, historyEntry, type Clock } from "./commands";

/**
 * Turning a wizard request into a stored event (spec 5.1, 6.2): the planner input and its
 * name-free AI context, and the mapping from the planner's `EventPlan` to an `EventDoc`. All
 * amounts and dates come from code; the model only ever supplied percentages and offsets.
 */

export type PlanSource = (typeof PLAN_SOURCES)[number];
type Origin = BudgetLineDoc["origin"];

/** The planner's input. The title travels with it but `buildPlanPrompt` never sends it. */
export function planInputOf(request: CreateEventRequest): EventInput {
  return {
    eventType: request.eventType,
    title: request.title,
    eventDate: request.eventDate,
    city: request.city,
    guestCount: request.guestCount,
    budget: request.budget,
    vibe: request.vibe,
    functions: request.functions.map((fn) => fn.name),
    language: request.language,
  };
}

/** Personalisation for the prompt: honorees by role, age, gender and interests only (spec 9.4). */
export function planContextOf(request: CreateEventRequest, profile: Pick<UserDoc, "budgetStyle" | "role"> | null): PlanContext {
  return {
    ...EMPTY_CONTEXT,
    occasion: request.occasion,
    occasionOther: request.occasionOther,
    milestone: request.milestone,
    theme: request.theme,
    tradition: request.tradition,
    traditionOther: request.traditionOther,
    dietary: request.dietary,
    honorees: request.honorees.map(({ role, age, gender, interests }) => ({ role, age, gender, interests })),
    flags: request.flags,
    budgetStyle: profile?.budgetStyle ?? null,
    role: profile?.role ?? null,
  };
}

export interface NewEventOptions {
  ownerUid: string;
  today: string;
  /** ISO timestamp for `createdAt`, `updatedAt` and vendor history. */
  now: string;
  source: PlanSource;
  budgetStyle: UserDoc["budgetStyle"];
}

const TENTHS = 1000;

/**
 * Function shares in tenths of a percent that sum to exactly 100.0: shares the user typed are kept,
 * the rest of the 100% is split by the plan's suggested weights (spec 5.1 "Utsav makes them add up").
 */
export function functionShares(typed: (number | null)[], weights: number[]): number[] {
  const open = typed.flatMap((share, i) => (share === null ? [i] : []));
  if (open.length === 0)
    return allocate(
      TENTHS,
      typed.map((share) => share ?? 0),
    ).map((tenths) => tenths / 10);
  const fixed = typed.reduce<number>((sum, share) => sum + (share ?? 0) * 10, 0);
  const spread = allocate(
    Math.max(0, TENTHS - fixed),
    open.map((i) => weights[i]),
  );
  return typed.map((share, i) => share ?? spread[open.indexOf(i)] / 10);
}

/** Adds a Contingency line when the plan has none (invariant 2), sized by the user's budget style. */
function withContingency(lines: EventPlan["budget"]["lines"], total: number, percent: number): EventPlan["budget"]["lines"] {
  if (lines.some((line) => nameKey(line.category) === "contingency")) return lines;
  const amounts = allocate(total, [...lines.map((line) => line.amount * (100 - percent)), total * percent]);
  return [...lines, { category: "Contingency", amount: 0, percent: 0, note: "" }].map((line, i) => ({ ...line, amount: amounts[i] }));
}

function budgetLines(plan: EventPlan, origin: Origin, contingencyPercent: number): BudgetLineDoc[] {
  const taken: string[] = [];
  return withContingency(plan.budget.lines, plan.budget.total, contingencyPercent).map((line) => {
    const id = uniqueId("line", line.category, taken);
    taken.push(id);
    return { id, category: line.category, amount: line.amount, percent: line.percent, note: line.note, origin };
  });
}

function functionDocs(plan: EventPlan, request: CreateEventRequest, origin: Origin): FunctionDoc[] {
  const typed = request.functions.length > 0;
  const rows = typed
    ? request.functions
    : plan.functions.map((fn) => ({ name: fn.name, date: null, startTime: null, endTime: null, sharePercent: null }));
  const planned = rows.map((row) => plan.functions.find((fn) => nameKey(fn.name) === nameKey(row.name)));
  const shares = functionShares(
    rows.map((row) => row.sharePercent),
    planned.map((fn) => fn?.amount ?? 1),
  );
  const taken: string[] = [];
  return rows.map((row, i) => {
    const id = uniqueId("fn", row.name, taken);
    taken.push(id);
    return {
      id,
      name: row.name,
      date: row.date ?? planned[i]?.date ?? request.eventDate,
      startTime: row.startTime,
      endTime: row.endTime,
      sharePercent: shares[i],
      amount: 0,
      highlights: planned[i]?.highlights ?? [],
      origin: typed ? "user" : origin,
    };
  });
}

function vendorDocs(plan: EventPlan, lines: BudgetLineDoc[], origin: Origin, now: string): VendorDoc[] {
  const lineFor = (name: string | null) => (name ? lines.find((line) => nameKey(line.category) === nameKey(name))?.id : undefined);
  const taken: string[] = [];
  return plan.vendors.map((vendor) => {
    const id = uniqueId("vendor", vendor.category, taken);
    taken.push(id);
    return {
      id,
      category: vendor.category,
      label: "",
      budgetLineId: lineFor(vendor.budgetCategory) ?? lineFor(vendor.category) ?? null,
      functionIds: [],
      bookByDaysBefore: vendor.bookByDaysBefore,
      status: "to_research",
      quotedAmount: null,
      paidAmount: 0,
      notes: "",
      contact: "",
      questions: vendor.questions,
      history: [{ status: "to_research", at: now }],
      drafts: [],
      origin,
    };
  });
}

function taskDocs(plan: EventPlan, origin: Origin): TaskDoc[] {
  return plan.timeline.map((task) => ({
    id: task.id,
    title: task.title,
    category: task.category,
    daysBefore: task.daysBefore,
    pinnedDate: null,
    functionId: null,
    done: false,
    doneAt: null,
    origin,
  }));
}

/** T1 ideas are the only ideas written directly, as `suggested` (spec 5.7). */
function ideaDocs(plan: EventPlan): IdeaDoc[] {
  const taken: string[] = [];
  return plan.ideas.map((idea) => {
    const id = uniqueId("idea", idea.title, taken);
    taken.push(id);
    return {
      id,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      estimatedCost: idea.estimatedCost,
      costBasis: "per event",
      basis: filterBasis(idea.basis),
      effort: "mixed",
      state: "suggested",
      origin: "ai",
      source: "ai",
    };
  });
}

const PENDING_REVIEW = Object.fromEntries(REVIEW_SECTIONS.map((section) => [section, "pending"])) as NonNullable<EventDoc["review"]>;

/** The stored event for a generated (or template) plan; `finalizePlan` derives amounts, stats and warnings. */
export function planToEventDoc(plan: EventPlan, request: CreateEventRequest, options: NewEventOptions): EventDoc {
  const origin: Origin = options.source === "ai" ? "ai" : "code";
  const lines = budgetLines(plan, origin, CONTINGENCY_PERCENT[options.budgetStyle ?? "balanced"]);
  const doc: EventDoc = {
    ownerUid: options.ownerUid,
    version: CREATED_VERSION,
    schemaVersion: 1,
    status: "active",
    source: options.source,
    details: detailsFromRequest(request),
    summary: { text: plan.summary, origin },
    budget: { total: plan.budget.total, lines },
    functions: functionDocs(plan, request, origin),
    tasks: taskDocs(plan, origin),
    vendors: vendorDocs(plan, lines, origin, options.now),
    ideas: options.source === "ai" ? ideaDocs(plan) : [],
    dismissedIdeaTitles: [],
    guests: {
      total: request.guestCount,
      adults: null,
      kids: null,
      elderly: null,
      veg: null,
      jain: null,
      nonveg: null,
      outstation: null,
      cateringBufferPercent: 10,
    },
    honorees: request.honorees.map((person, i) => ({ id: `person-${i + 1}`, ...person })),
    flags: request.flags,
    review: options.source === "ai" ? PENDING_REVIEW : null,
    warnings: [],
    share: { active: false, tokenHash: null, showAmounts: false, showNotes: false },
    stats: {
      tasksDone: 0,
      tasksTotal: 0,
      openDueDates: [],
      vendorsByStatus: { to_research: 0, contacted: 0, quoted: 0, booked: 0, paid: 0, not_needed: 0 },
      committed: 0,
      pending: { count: 0, expireAt: null },
    },
    createdAt: options.now,
    updatedAt: options.now,
  };
  const event = finalizePlan(doc, options.today);
  assertPlanInvariants(event);
  return event;
}

/** The starter template plan for the same request: the "before" of an AI plan's creation entry (spec 6.2). */
export function templateEventDoc(request: CreateEventRequest, options: Omit<NewEventOptions, "source">): EventDoc {
  const input = planInputOf(request);
  const plan = buildPlan(input, templateDraft(input, request.occasion), {
    today: options.today,
    source: "template",
    now: new Date(options.now),
  });
  return planToEventDoc(plan, request, { ...options, source: "template" });
}

const ALL_RESET = Object.fromEntries(REVIEW_SECTIONS.map((section) => [section, "reset"])) as NonNullable<EventDoc["review"]>;

/**
 * The creation history entry of an AI plan (spec 5.1): its `before` is the starter template for the
 * same request, so undoing it is "Start from the starter template instead" (spec 6.2).
 */
export function creationHistory(event: EventDoc, template: EventDoc, clock: Clock): HistoryDoc {
  const before = { ...template, version: 0, review: ALL_RESET };
  return historyEntry(before, event, { actor: "system", label: "AI plan created", ops: [] }, clock);
}
