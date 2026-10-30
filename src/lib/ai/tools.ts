import { z } from "zod";
import { addDays, WEEKDAYS } from "@/lib/domain/dates";
import { formatInr } from "@/lib/domain/budget";
import { COST_BASES, EFFORTS, IDEA_CATEGORIES, VENDOR_STATUSES } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations } from "@/lib/domain/ops/apply";
import { planOperationSchema, type PlanOperation } from "@/lib/domain/ops/schema";
import { filterBasis } from "@/lib/domain/personalisation";
import { resolveName, type Resolved } from "@/lib/domain/resolve";
import type { ProposalDraftItem } from "@/lib/plan/proposals";
import { jsonSchemaOf, type ToolCall, type ToolDeclaration } from "./model";

/**
 * AI mode's function declarations and the tool-to-op mapping (spec 6.3). One tool per proposable
 * op type; tools take the names people use and `toolCallsToItems` resolves them to ids against the
 * plan, including items an earlier call in the same reply creates (which become dependencies).
 * Anything that does not resolve is still a card, marked invalid with the reason.
 */

const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => s.trim().slice(0, max));
const why = text(160).optional().describe("One short sentence on why, shown under the card");
const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .optional()
  .describe("24-hour HH:mm, India time");
const amount = z.number().int().min(0);

const TOOL_ARGS = {
  adjust_budget_category: z.object({
    category: text(40),
    mode: z.enum(["percent_change", "set_amount", "change_amount"]),
    value: z.number().finite().describe("Percent for percent_change (negative to cut), rupees otherwise"),
    rebalance: z.enum(["change_total", "spread_to_others", "to_contingency"]).default("change_total"),
    why,
  }),
  add_budget_category: z.object({
    category: text(40),
    amount: amount.optional(),
    percent: z.number().min(0).max(100).optional().describe("Percent of the total, when no amount was said"),
    fundFrom: z.enum(["contingency", "spread", "increase_total"]).default("contingency"),
    why,
  }),
  remove_budget_category: z.object({
    category: text(40),
    moveTo: text(40).optional().describe("Category that receives its money; Contingency by default"),
    why,
  }),
  set_budget_note: z.object({ category: text(40), note: text(200), why }),
  set_total_budget: z.object({ total: amount, strategy: z.enum(["rescale", "replan"]).default("rescale"), why }),
  move_function: z.object({
    function: text(80).describe("Function name or id"),
    date: z.iso.date().optional(),
    weekday: z.enum(WEEKDAYS).optional(),
    startTime: time,
    endTime: time,
    why,
  }),
  add_function: z.object({
    name: text(40),
    date: z.iso.date().optional(),
    dayOffset: z.number().int().min(-14).max(1).optional().describe("Days from the event date: -2 is two days before, 1 the day after"),
    sharePercent: z.number().min(0).max(100).optional(),
    startTime: time,
    endTime: time,
    why,
  }),
  remove_function: z.object({ function: text(80), why }),
  set_function_share: z.object({ function: text(80), percent: z.number().min(0).max(100), why }),
  add_task: z.object({
    title: text(120),
    category: text(40),
    daysBefore: z.number().int().min(-7).max(730).optional().describe("Days before the event; negative means after it"),
    date: z.iso.date().optional(),
    function: text(80).optional(),
    why,
  }),
  update_task: z.object({
    taskId: text(120).describe("Task id or exact title"),
    title: text(120).optional(),
    date: z.iso.date().optional(),
    done: z.boolean().optional(),
    why,
  }),
  remove_task: z.object({ taskId: text(120), why }),
  add_vendor: z.object({
    category: text(40),
    budgetCategory: text(40).optional(),
    functions: z.array(text(80)).max(10).optional(),
    bookByDaysBefore: z.number().int().min(0).max(730),
    questions: z.array(text(160)).max(8).optional(),
    why,
  }),
  update_vendor: z.object({
    vendor: text(80).describe("Vendor category or id"),
    notes: text(1000).optional(),
    questions: z.array(text(160)).max(8).optional(),
    budgetCategory: text(40).optional(),
    why,
  }),
  set_vendor_status: z.object({
    vendor: text(80),
    status: z.enum(VENDOR_STATUSES),
    quotedAmount: amount.optional(),
    paidAmount: amount.optional(),
    why,
  }),
  remove_vendor: z.object({ vendor: text(80), why }),
  add_idea: z.object({
    title: text(80),
    description: text(300),
    category: z.enum(IDEA_CATEGORIES),
    estimatedCost: amount.nullable().optional().describe("Rough estimate in rupees, not a quote"),
    costBasis: z.enum(COST_BASES).default("per event"),
    basis: z.array(text(80)).max(10).default([]),
    effort: z.enum(EFFORTS).default("mixed"),
    why,
  }),
  set_guests: z.object({
    total: z.number().int().min(1).max(10_000),
    kids: z.number().int().min(0).optional(),
    elderly: z.number().int().min(0).optional(),
    why,
  }),
  set_event_date: z.object({ date: z.iso.date().optional(), shiftDays: z.number().int().min(-365).max(365).optional(), why }),
  reply: z.object({ text: text(400).describe("A short answer; quote numbers only from the facts block") }),
} as const;

export type ToolName = keyof typeof TOOL_ARGS;
type Args<T extends ToolName> = z.output<(typeof TOOL_ARGS)[T]>;

const DESCRIPTIONS: Record<ToolName, string> = {
  adjust_budget_category:
    "Change one budget category by a percent or an amount. Use change_total for a cut unless the user wants the total kept.",
  add_budget_category: "Add a new budget category.",
  remove_budget_category: "Remove a budget category; its money and vendors move to another category.",
  set_budget_note: "Set the note on a budget category.",
  set_total_budget: "Change the total budget. rescale changes every category in proportion; replan opens the What-if re-plan.",
  move_function: "Move a function (for example the sangeet) to a date or weekday, optionally with times.",
  add_function: "Add a function such as a mehndi or reception.",
  remove_function: "Remove a function; its tasks and vendors stay but are unlinked.",
  set_function_share: "Change a function's share of the budget.",
  add_task: "Add a task to the timeline.",
  update_task: "Change a task's title or date, or mark it done.",
  remove_task: "Remove a task.",
  add_vendor: "Add a vendor category to the checklist. Never include a business name or contact.",
  update_vendor: "Change a vendor's notes, questions or budget category.",
  set_vendor_status: "Change a vendor's status, with the quoted or paid amount the user stated.",
  remove_vendor: "Remove a vendor from the checklist.",
  add_idea: "Suggest an idea for the event.",
  set_guests: "Change the guest count.",
  set_event_date: "Move the event to another date, or shift it by a number of days.",
  reply: "Answer a question, or explain which screen to use for a change you cannot make.",
};

export const TOOL_NAMES = Object.keys(TOOL_ARGS) as ToolName[];

/** `PLAN_TOOLS` (spec 6.3), generated from the same Zod schemas that check the model's arguments. */
export const PLAN_TOOLS: readonly ToolDeclaration[] = TOOL_NAMES.map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  parametersJsonSchema: jsonSchemaOf(TOOL_ARGS[name], "input"),
}));

/** A reference that did not resolve still needs a value in the op; the card shows the reason instead. */
const placeholder = (name: string) => name.trim().slice(0, 80) || "unknown";

interface Mapping {
  op: PlanOperation | null;
  /** Why the card is invalid (a name did not resolve, or a value is missing). */
  invalid?: string;
  reply?: string;
}

type Resolver = (query: string) => Resolved & { query: string };

interface Resolvers {
  line: Resolver;
  fn: Resolver;
  vendor: Resolver;
  task: Resolver;
}

function resolvers(plan: EventDoc): Resolvers {
  const wrap =
    (resolve: (q: string) => Resolved): Resolver =>
    (query) => ({ ...resolve(query), query });
  return {
    line: wrap((q) => resolveName(plan.budget.lines, (l) => l.category, q, "budget category")),
    fn: wrap((q) => resolveName(plan.functions, (f) => f.name, q, "function")),
    vendor: wrap((q) => resolveName(plan.vendors, (v) => v.category, q, "vendor")),
    task: wrap((q) => resolveName(plan.tasks, (t) => t.title, q, "task")),
  };
}

const idOf = (resolved: ReturnType<Resolver>) => (resolved.ok ? resolved.id : placeholder(resolved.query));
const firstFailure = (...all: ReturnType<Resolver>[]) => all.find((r) => !r.ok) as { reason: string } | undefined;

function mapCall(name: ToolName, raw: unknown, plan: EventDoc, r: Resolvers): Mapping {
  switch (name) {
    case "adjust_budget_category": {
      const a = raw as Args<typeof name>;
      const line = r.line(a.category);
      return {
        op: { type: name, lineId: idOf(line), mode: a.mode, value: a.value, rebalance: a.rebalance },
        invalid: firstFailure(line)?.reason,
      };
    }
    case "add_budget_category": {
      const a = raw as Args<typeof name>;
      const amount = a.amount ?? (a.percent === undefined ? null : Math.round((plan.budget.total * a.percent) / 100));
      return {
        op: { type: name, category: a.category, amount: amount ?? 0, fundFrom: a.fundFrom },
        invalid: amount === null ? `Say how much to give ${a.category}` : undefined,
      };
    }
    case "remove_budget_category": {
      const a = raw as Args<typeof name>;
      const line = r.line(a.category);
      const moveTo = a.moveTo ? r.line(a.moveTo) : null;
      return {
        op: { type: name, lineId: idOf(line), ...(moveTo ? { moveToLineId: idOf(moveTo) } : {}) },
        invalid: firstFailure(line, ...(moveTo ? [moveTo] : []))?.reason,
      };
    }
    case "set_budget_note": {
      const a = raw as Args<typeof name>;
      const line = r.line(a.category);
      return { op: { type: name, lineId: idOf(line), note: a.note }, invalid: firstFailure(line)?.reason };
    }
    case "set_total_budget": {
      const a = raw as Args<typeof name>;
      if (a.strategy === "replan") {
        return { op: null, reply: `To re-plan around ${formatInr(a.total)}, open Budget and choose "What if?", then Smart re-plan.` };
      }
      return { op: { type: name, total: a.total, strategy: "rescale" } };
    }
    case "move_function": {
      const a = raw as Args<typeof name>;
      const fn = r.fn(a.function);
      const when = a.date ? { date: a.date } : a.weekday ? { weekday: a.weekday } : {};
      return {
        op: { type: name, functionId: idOf(fn), ...when, startTime: a.startTime, endTime: a.endTime },
        invalid: firstFailure(fn)?.reason,
      };
    }
    case "add_function": {
      const a = raw as Args<typeof name>;
      const when = a.date ? { date: a.date } : { dayOffset: a.dayOffset ?? 0 };
      return { op: { type: name, name: a.name, ...when, sharePercent: a.sharePercent, startTime: a.startTime, endTime: a.endTime } };
    }
    case "remove_function": {
      const a = raw as Args<typeof name>;
      const fn = r.fn(a.function);
      return { op: { type: name, functionId: idOf(fn) }, invalid: firstFailure(fn)?.reason };
    }
    case "set_function_share": {
      const a = raw as Args<typeof name>;
      const fn = r.fn(a.function);
      return { op: { type: name, functionId: idOf(fn), percent: a.percent }, invalid: firstFailure(fn)?.reason };
    }
    case "add_task": {
      const a = raw as Args<typeof name>;
      const fn = a.function ? r.fn(a.function) : null;
      const when = a.date ? { date: a.date } : { daysBefore: a.daysBefore ?? 14 };
      return {
        op: { type: name, title: a.title, category: a.category, ...when, functionId: fn ? idOf(fn) : null },
        invalid: fn ? firstFailure(fn)?.reason : undefined,
      };
    }
    case "update_task": {
      const a = raw as Args<typeof name>;
      const task = r.task(a.taskId);
      return { op: { type: name, taskId: idOf(task), title: a.title, date: a.date, done: a.done }, invalid: firstFailure(task)?.reason };
    }
    case "remove_task": {
      const a = raw as Args<typeof name>;
      const task = r.task(a.taskId);
      return { op: { type: name, taskId: idOf(task) }, invalid: firstFailure(task)?.reason };
    }
    case "add_vendor": {
      const a = raw as Args<typeof name>;
      const line = a.budgetCategory ? r.line(a.budgetCategory) : null;
      const fns = (a.functions ?? []).map(r.fn);
      const refs = { budgetLineId: line ? idOf(line) : null, functionIds: fns.map(idOf) };
      return {
        op: { type: name, category: a.category, ...refs, bookByDaysBefore: a.bookByDaysBefore, questions: a.questions },
        invalid: firstFailure(...(line ? [line] : []), ...fns)?.reason,
      };
    }
    case "update_vendor": {
      const a = raw as Args<typeof name>;
      const vendor = r.vendor(a.vendor);
      const line = a.budgetCategory ? r.line(a.budgetCategory) : null;
      const patch = { notes: a.notes, questions: a.questions, ...(line ? { budgetLineId: idOf(line) } : {}) };
      return { op: { type: name, vendorId: idOf(vendor), patch }, invalid: firstFailure(vendor, ...(line ? [line] : []))?.reason };
    }
    case "set_vendor_status": {
      const a = raw as Args<typeof name>;
      const vendor = r.vendor(a.vendor);
      return {
        op: { type: name, vendorId: idOf(vendor), status: a.status, quotedAmount: a.quotedAmount, paidAmount: a.paidAmount },
        invalid: firstFailure(vendor)?.reason,
      };
    }
    case "remove_vendor": {
      const a = raw as Args<typeof name>;
      const vendor = r.vendor(a.vendor);
      return { op: { type: name, vendorId: idOf(vendor) }, invalid: firstFailure(vendor)?.reason };
    }
    case "add_idea": {
      const a = raw as Args<typeof name>;
      const idea = {
        title: a.title,
        description: a.description,
        category: a.category,
        estimatedCost: a.estimatedCost ?? null,
        costBasis: a.costBasis,
        basis: filterBasis(a.basis),
        effort: a.effort,
      };
      return { op: { type: name, idea } };
    }
    case "set_guests": {
      const a = raw as Args<typeof name>;
      // A new total keeps an existing adults/kids split adding up: adults absorb the change.
      const kids = a.kids ?? plan.guests.kids;
      const adults = plan.guests.adults === null ? undefined : kids !== null && kids <= a.total ? a.total - kids : null;
      return { op: { type: name, guests: { total: a.total, adults, kids: a.kids, elderly: a.elderly } } };
    }
    case "set_event_date": {
      const a = raw as Args<typeof name>;
      const date = a.date ?? (a.shiftDays === undefined ? null : addDays(plan.details.eventDate, a.shiftDays));
      return {
        op: { type: "set_details", eventDate: date ?? plan.details.eventDate },
        invalid: date ? undefined : "Say the new date, or how many days to move it",
      };
    }
    case "reply":
      return { op: null, reply: (raw as Args<typeof name>).text };
  }
}

/** Ids that exist in `after` but not in `before`: what an item created. */
function createdIds(before: EventDoc, after: EventDoc): string[] {
  const ids = (plan: EventDoc) => [...plan.budget.lines, ...plan.functions, ...plan.tasks, ...plan.vendors].map((item) => item.id);
  const old = new Set(ids(before));
  return ids(after).filter((id) => !old.has(id));
}

/** Ids an op refers to, so an item that uses something an earlier item creates depends on it. */
function referencedIds(op: PlanOperation): string[] {
  const record = op as Record<string, unknown>;
  const ids = ["lineId", "moveToLineId", "functionId", "taskId", "vendorId", "budgetLineId"].map((key) => record[key]);
  const patch = (record.patch ?? {}) as Record<string, unknown>;
  return [...ids, patch.budgetLineId, ...((record.functionIds as unknown[] | undefined) ?? [])].filter(
    (id): id is string => typeof id === "string",
  );
}

export interface MappedCalls {
  items: ProposalDraftItem[];
  reply: string | null;
  /** Calls that could not become a card at all (unknown tool, malformed arguments). */
  dropped: number;
}

/**
 * Maps the model's calls to proposal items. Names resolve against the plan as it would be after
 * the earlier items, so "add a Photography category" then "add a photographer paid from
 * Photography" works, and the second item depends on the first. `clean` is the output filter.
 */
export function toolCallsToItems(calls: readonly ToolCall[], plan: EventDoc, today: string, clean: (text: string) => string): MappedCalls {
  const items: ProposalDraftItem[] = [];
  const replies: string[] = [];
  const creator = new Map<string, string>();
  let working = plan;
  let dropped = 0;
  for (const call of calls) {
    const name = call.name as ToolName;
    const parsed = TOOL_NAMES.includes(name) ? TOOL_ARGS[name].safeParse(call.args) : null;
    if (!parsed?.success) {
      dropped += 1;
      continue;
    }
    const mapping = mapCall(name, parsed.data, working, resolvers(working));
    if (mapping.reply) replies.push(clean(mapping.reply));
    const op = mapping.op ? planOperationSchema.safeParse(cleanOp(mapping.op, clean)) : null;
    if (!op) continue;
    if (!op.success) {
      dropped += 1;
      continue;
    }
    const id = `item-${items.length + 1}`;
    const dependsOn = [...new Set(referencedIds(op.data).flatMap((ref) => creator.get(ref) ?? []))];
    const rationale = clean(("why" in parsed.data && parsed.data.why) || "");
    items.push({ id, op: op.data, rationale, dependsOn, invalidReason: mapping.invalid });
    if (mapping.invalid) continue;
    const run = applyOperations(working, [op.data], { today, actor: "ai", proposalOrigin: "ai" });
    if (!run.results[0].ok) continue;
    for (const created of createdIds(working, run.plan)) creator.set(created, id);
    working = run.plan;
  }
  return { items, reply: replies.length > 0 ? replies.join(" ").slice(0, 400) : null, dropped };
}

/** Runs the output filter over every model-written text in an op. */
function cleanOp(op: PlanOperation, clean: (text: string) => string): PlanOperation {
  switch (op.type) {
    case "add_task":
      return { ...op, title: clean(op.title) };
    case "add_vendor":
      return { ...op, questions: op.questions?.map(clean) };
    case "update_vendor":
      return {
        ...op,
        patch: {
          ...op.patch,
          notes: op.patch.notes === undefined ? undefined : clean(op.patch.notes),
          questions: op.patch.questions?.map(clean),
        },
      };
    case "set_budget_note":
      return { ...op, note: clean(op.note) };
    case "add_idea":
      return { ...op, idea: { ...op.idea, title: clean(op.idea.title), description: clean(op.idea.description) } };
    default:
      return op;
  }
}
