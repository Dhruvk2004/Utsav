import { addDays } from "@/lib/domain/dates";
import { IDEA_CATEGORY_LABELS, VENDOR_STATUS_LABELS } from "@/lib/domain/labels";
import { IDEA_CATEGORIES, VENDOR_STATUSES } from "@/lib/domain/model/enums";
import { FUNCTION_MAX_OFFSET, FUNCTION_MIN_OFFSET, type EventDoc } from "@/lib/domain/model/event";
import { planOperationSchema, type OpOf, type PlanOperation } from "@/lib/domain/ops/schema";
import { LIMITS } from "@/lib/domain/schemas";
import { parseRupees } from "./money";

/**
 * Edit forms (spec 6.1 table) as data: the fields each op's editor shows, its starting values and
 * how the values become an op again. The same forms are the Timeline, Ideas, Vendors and Budget
 * tabs' manual editors and every suggestion card's Edit, so a card edit is the tab edit.
 */

export interface Option {
  value: string;
  label: string;
}

interface FieldBase {
  name: string;
  label: string;
  hint?: string;
  /** Shown only while another field has one of these values. */
  showWhen?: { name: string; values: string[] };
  optional?: boolean;
}

export type FieldSpec =
  | (FieldBase & { kind: "text" | "textarea" | "lines"; max: number })
  | (FieldBase & { kind: "money" })
  | (FieldBase & { kind: "number"; min: number; max: number })
  | (FieldBase & { kind: "date"; min?: string; max?: string })
  | (FieldBase & { kind: "time" })
  | (FieldBase & { kind: "select" | "radio" | "checks"; options: Option[] });

export type FormValues = Record<string, string | string[]>;
export type BuildResult = { ok: true; op: PlanOperation } | { ok: false; errors: Record<string, string> };

export interface OpForm {
  fields: FieldSpec[];
  values: FormValues;
  build(values: FormValues): BuildResult;
}

const str = (values: FormValues, name: string) => {
  const value = values[name];
  return typeof value === "string" ? value : "";
};
const list = (values: FormValues, name: string) => {
  const value = values[name];
  return Array.isArray(value) ? value : [];
};
/** Lines of a "one per line" textarea, trimmed and without blanks. */
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const number = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/[,₹\s]/g, "")));
const nullableCount = (text: string) => (text.trim() === "" ? null : number(text));

/** Parses a candidate op; schema issues come back under the form field they belong to. */
function parsed(candidate: unknown, fieldOf: (path: PropertyKey[]) => string): BuildResult {
  const result = planOperationSchema.safeParse(candidate);
  if (result.success) return { ok: true, op: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = fieldOf(issue.path);
    errors[field] ??= issue.code === "invalid_type" ? "Enter a value" : issue.message;
  }
  return { ok: false, errors };
}

const lastKey = (path: PropertyKey[]) =>
  String(path.find((p) => typeof p === "string" && p !== "idea" && p !== "patch" && p !== "guests") ?? "form");

const lineOptions = (plan: EventDoc, none?: string): Option[] => [
  ...(none ? [{ value: "", label: none }] : []),
  ...plan.budget.lines.map((line) => ({ value: line.id, label: line.category })),
];
const functionOptions = (plan: EventDoc): Option[] => plan.functions.map((fn) => ({ value: fn.id, label: fn.name }));

// Task due: "N days before / after the event" (stored relative) or a fixed date (spec 5.5).
const DUE_MODES: Option[] = [
  { value: "before", label: "Days before the event" },
  { value: "after", label: "Days after the event" },
  { value: "date", label: "On a date" },
];

function dueFields(plan: EventDoc, today: string): FieldSpec[] {
  const latest = addDays(plan.details.eventDate, -LIMITS.minDaysBefore);
  return [
    { kind: "radio", name: "dueMode", label: "Due", options: DUE_MODES },
    {
      kind: "number",
      name: "days",
      label: "Days",
      min: 0,
      max: LIMITS.maxPlanningDays,
      showWhen: { name: "dueMode", values: ["before", "after"] },
    },
    { kind: "date", name: "date", label: "Due date", min: today, max: latest, showWhen: { name: "dueMode", values: ["date"] } },
  ];
}

function dueValues(daysBefore: number | undefined, date: string | null | undefined): FormValues {
  if (date) return { dueMode: "date", days: "", date };
  const days = daysBefore ?? 30;
  return { dueMode: days < 0 ? "after" : "before", days: String(Math.abs(days)), date: "" };
}

function dueOf(values: FormValues): { daysBefore?: number; date?: string } {
  if (str(values, "dueMode") === "date") return { date: str(values, "date") };
  const days = number(str(values, "days"));
  return { daysBefore: str(values, "dueMode") === "after" ? -days : days };
}

/** Category choices: the budget categories plus "General" and whatever the item already has. */
function categoryOptions(plan: EventDoc, current: string): Option[] {
  const names = [...new Set([current, ...plan.budget.lines.map((line) => line.category), "General"].filter(Boolean))];
  return names.map((name) => ({ value: name, label: name }));
}

function taskForm(plan: EventDoc, op: OpOf<"add_task" | "update_task">, today: string): OpForm {
  const task = op.type === "update_task" ? plan.tasks.find((t) => t.id === op.taskId) : undefined;
  const title = op.title ?? task?.title ?? "";
  const category = op.category ?? task?.category ?? "General";
  const fields: FieldSpec[] = [
    { kind: "text", name: "title", label: "Title", max: 120 },
    { kind: "select", name: "category", label: "Category", options: categoryOptions(plan, category) },
  ];
  if (op.type === "add_task")
    fields.push({
      kind: "select",
      name: "functionId",
      label: "Function",
      options: [{ value: "", label: "None" }, ...functionOptions(plan)],
    });
  fields.push(...dueFields(plan, today));
  if (op.type === "update_task")
    fields.push({
      kind: "select",
      name: "done",
      label: "Status",
      options: [
        { value: "no", label: "To do" },
        { value: "yes", label: "Done" },
      ],
    });

  const pinned = op.type === "update_task" ? (op.date ?? task?.pinnedDate) : op.date;
  const values: FormValues = {
    title,
    category,
    ...dueValues(op.daysBefore ?? task?.daysBefore, pinned),
    ...(op.type === "add_task" ? { functionId: op.functionId ?? "" } : { done: (op.done ?? task?.done) ? "yes" : "no" }),
  };
  return {
    fields,
    values,
    build(next) {
      const due = dueOf(next);
      const base = { title: str(next, "title"), category: str(next, "category"), ...due };
      const candidate =
        op.type === "add_task"
          ? { type: "add_task", ...base, functionId: str(next, "functionId") || null }
          : { type: "update_task", taskId: op.taskId, ...base, done: str(next, "done") === "yes" };
      return parsed(candidate, (path) => (path[0] === "daysBefore" ? "days" : lastKey(path)));
    },
  };
}

function ideaForm(plan: EventDoc, op: OpOf<"add_idea" | "update_idea">): OpForm {
  const existing = op.type === "update_idea" ? plan.ideas.find((i) => i.id === op.ideaId) : undefined;
  const idea = op.type === "add_idea" ? op.idea : { ...existing, ...op.patch };
  return {
    fields: [
      { kind: "text", name: "title", label: "Title", max: 80 },
      { kind: "textarea", name: "description", label: "Description", max: 300, optional: true },
      {
        kind: "select",
        name: "category",
        label: "Category",
        options: IDEA_CATEGORIES.map((c) => ({ value: c, label: IDEA_CATEGORY_LABELS[c] })),
      },
      { kind: "money", name: "estimatedCost", label: "Estimated cost", hint: "A rough estimate, not a quote.", optional: true },
    ],
    values: {
      title: idea.title ?? "",
      description: idea.description ?? "",
      category: idea.category ?? "decor",
      estimatedCost: idea.estimatedCost == null ? "" : String(idea.estimatedCost),
    },
    build(next) {
      const fields = {
        title: str(next, "title"),
        description: str(next, "description"),
        category: str(next, "category"),
        estimatedCost: parseRupees(str(next, "estimatedCost")),
      };
      const candidate =
        op.type === "add_idea"
          ? { type: "add_idea", idea: { ...op.idea, ...fields } }
          : { type: "update_idea", ideaId: op.ideaId, patch: fields };
      return parsed(candidate, lastKey);
    },
  };
}

const ADJUST_MODES: Option[] = [
  { value: "percent_change", label: "By %" },
  { value: "set_amount", label: "To ₹" },
  { value: "change_amount", label: "By ₹" },
];
const REBALANCE: Option[] = [
  { value: "change_total", label: "Change the total" },
  { value: "to_contingency", label: "Use Contingency" },
  { value: "spread_to_others", label: "Spread over the other categories" },
];

function budgetForm(
  plan: EventDoc,
  op: OpOf<
    | "adjust_budget_category"
    | "add_budget_category"
    | "remove_budget_category"
    | "set_budget_note"
    | "set_total_budget"
    | "set_budget_lines"
  >,
): OpForm {
  switch (op.type) {
    case "adjust_budget_category":
      return {
        fields: [
          { kind: "radio", name: "mode", label: "Change", options: ADJUST_MODES },
          { kind: "text", name: "value", label: "Amount or percent", max: 14, hint: "Use a minus sign to reduce, e.g. -20." },
          { kind: "radio", name: "rebalance", label: "Saving or extra goes to", options: REBALANCE },
        ],
        values: { mode: op.mode, value: String(op.value), rebalance: op.rebalance },
        build: (next) =>
          parsed({ ...op, mode: str(next, "mode"), value: number(str(next, "value")), rebalance: str(next, "rebalance") }, () => "value"),
      };
    case "add_budget_category":
      return {
        fields: [
          { kind: "text", name: "category", label: "Category name", max: 40 },
          { kind: "money", name: "amount", label: "Amount" },
          {
            kind: "select",
            name: "fundFrom",
            label: "Fund it from",
            options: [
              { value: "contingency", label: "Contingency" },
              { value: "spread", label: "The other categories" },
              { value: "increase_total", label: "A bigger total" },
            ],
          },
        ],
        values: { category: op.category, amount: op.amount ? String(op.amount) : "", fundFrom: op.fundFrom },
        build: (next) =>
          parsed(
            { ...op, category: str(next, "category"), amount: parseRupees(str(next, "amount")), fundFrom: str(next, "fundFrom") },
            lastKey,
          ),
      };
    case "remove_budget_category":
      return {
        fields: [
          {
            kind: "select",
            name: "moveToLineId",
            label: "Move its amount and vendors to",
            options: lineOptions(plan).filter((o) => o.value !== op.lineId),
          },
        ],
        values: { moveToLineId: op.moveToLineId ?? plan.budget.lines.find((l) => l.category.toLowerCase() === "contingency")?.id ?? "" },
        build: (next) => parsed({ ...op, moveToLineId: str(next, "moveToLineId") || undefined }, lastKey),
      };
    case "set_budget_note":
      return {
        fields: [{ kind: "textarea", name: "note", label: "Note", max: 200, optional: true }],
        values: { note: op.note },
        build: (next) => parsed({ ...op, note: str(next, "note") }, lastKey),
      };
    case "set_total_budget":
      return {
        fields: [{ kind: "money", name: "total", label: "New total" }],
        values: { total: String(op.total) },
        build: (next) => parsed({ ...op, total: parseRupees(str(next, "total")) }, lastKey),
      };
    case "set_budget_lines":
      return {
        fields: op.lines.map((row) => ({
          kind: "money" as const,
          name: row.lineId,
          label: `${plan.budget.lines.find((l) => l.id === row.lineId)?.category ?? row.lineId}, amount after`,
        })),
        values: Object.fromEntries(op.lines.map((row) => [row.lineId, String(row.amount)])),
        build: (next) =>
          parsed(
            { ...op, lines: op.lines.map((row) => ({ ...row, amount: parseRupees(str(next, row.lineId)) })) },
            (path) => op.lines[Number(path[1])]?.lineId ?? "form",
          ),
      };
  }
}

function functionForm(plan: EventDoc, op: OpOf<"add_function" | "move_function" | "set_function_share">, today: string): OpForm {
  const window = {
    min: [today, addDays(plan.details.eventDate, FUNCTION_MIN_OFFSET)].sort()[1],
    max: addDays(plan.details.eventDate, FUNCTION_MAX_OFFSET),
  };
  const fn = op.type === "add_function" ? undefined : plan.functions.find((f) => f.id === op.functionId);
  const times: FieldSpec[] = [
    { kind: "time", name: "startTime", label: "Start time", optional: true },
    { kind: "time", name: "endTime", label: "End time", optional: true },
  ];
  const timeOf = (next: FormValues, name: string) => str(next, name) || null;
  if (op.type === "set_function_share") {
    return {
      fields: [{ kind: "number", name: "percent", label: "Share of the budget (%)", min: 0, max: 100 }],
      values: { percent: String(op.percent) },
      build: (next) => parsed({ ...op, percent: number(str(next, "percent")) }, lastKey),
    };
  }
  if (op.type === "move_function") {
    return {
      fields: [{ kind: "date", name: "date", label: "Date", ...window }, ...times],
      values: { date: op.date ?? fn?.date ?? "", startTime: op.startTime ?? fn?.startTime ?? "", endTime: op.endTime ?? fn?.endTime ?? "" },
      build: (next) =>
        parsed(
          {
            type: "move_function",
            functionId: op.functionId,
            date: str(next, "date"),
            startTime: timeOf(next, "startTime"),
            endTime: timeOf(next, "endTime"),
          },
          lastKey,
        ),
    };
  }
  const date = op.date ?? addDays(plan.details.eventDate, op.dayOffset ?? 0);
  return {
    fields: [
      { kind: "text", name: "name", label: "Name", max: 40 },
      { kind: "date", name: "date", label: "Date", ...window },
      ...times,
      { kind: "number", name: "sharePercent", label: "Share of the budget (%)", min: 0, max: 100 },
    ],
    values: { name: op.name, date, startTime: op.startTime ?? "", endTime: op.endTime ?? "", sharePercent: String(op.sharePercent ?? 10) },
    build: (next) =>
      parsed(
        {
          type: "add_function",
          name: str(next, "name"),
          date: str(next, "date"),
          startTime: timeOf(next, "startTime"),
          endTime: timeOf(next, "endTime"),
          sharePercent: number(str(next, "sharePercent")),
        },
        lastKey,
      ),
  };
}

function vendorForm(plan: EventDoc, op: OpOf<"add_vendor" | "update_vendor" | "set_vendor_status">): OpForm {
  const statusOptions = VENDOR_STATUSES.map((s) => ({ value: s, label: VENDOR_STATUS_LABELS[s] }));
  if (op.type === "set_vendor_status") {
    const vendor = plan.vendors.find((v) => v.id === op.vendorId);
    return {
      fields: [
        { kind: "select", name: "status", label: "Status", options: statusOptions },
        { kind: "money", name: "quotedAmount", label: "Quoted amount", optional: true },
        { kind: "money", name: "paidAmount", label: "Paid amount", optional: true },
      ],
      values: {
        status: op.status,
        quotedAmount: String(op.quotedAmount ?? vendor?.quotedAmount ?? ""),
        paidAmount: String(op.paidAmount ?? vendor?.paidAmount ?? ""),
      },
      build(next) {
        const quoted = parseRupees(str(next, "quotedAmount"));
        const paid = parseRupees(str(next, "paidAmount"));
        return parsed(
          {
            type: op.type,
            vendorId: op.vendorId,
            status: str(next, "status"),
            ...(quoted === null ? {} : { quotedAmount: quoted }),
            ...(paid === null ? {} : { paidAmount: paid }),
          },
          lastKey,
        );
      },
    };
  }
  const vendor = op.type === "update_vendor" ? plan.vendors.find((v) => v.id === op.vendorId) : undefined;
  const current = op.type === "add_vendor" ? op : { ...vendor, ...op.patch };
  const fields: FieldSpec[] = [];
  if (op.type === "add_vendor") fields.push({ kind: "text", name: "category", label: "Vendor category", max: 40 });
  fields.push({ kind: "select", name: "budgetLineId", label: "Budget line", options: lineOptions(plan, "None") });
  if (plan.functions.length > 0)
    fields.push({ kind: "checks", name: "functionIds", label: "Functions", options: functionOptions(plan), optional: true });
  if (op.type === "add_vendor")
    fields.push({
      kind: "number",
      name: "bookByDaysBefore",
      label: "Book by (days before the event)",
      min: 0,
      max: LIMITS.maxPlanningDays,
    });
  if (op.type === "update_vendor") fields.push({ kind: "textarea", name: "notes", label: "Notes", max: 1000, optional: true });
  fields.push({ kind: "lines", name: "questions", label: "Questions to ask (one per line)", max: 8, optional: true });
  return {
    fields,
    values: {
      category: op.type === "add_vendor" ? op.category : "",
      budgetLineId: current.budgetLineId ?? "",
      functionIds: current.functionIds ?? [],
      bookByDaysBefore: op.type === "add_vendor" ? String(op.bookByDaysBefore) : "",
      notes: op.type === "update_vendor" ? (op.patch.notes ?? vendor?.notes ?? "") : "",
      questions: (current.questions ?? []).join("\n"),
    },
    build(next) {
      const common = {
        budgetLineId: str(next, "budgetLineId") || null,
        functionIds: list(next, "functionIds"),
        questions: lines(str(next, "questions")),
      };
      if (op.type === "add_vendor") {
        return parsed(
          { type: "add_vendor", category: str(next, "category"), bookByDaysBefore: number(str(next, "bookByDaysBefore")), ...common },
          (path) => (path[0] === "questions" ? "questions" : lastKey(path)),
        );
      }
      return parsed({ type: "update_vendor", vendorId: op.vendorId, patch: { ...common, notes: str(next, "notes") } }, (path) =>
        path.includes("questions") ? "questions" : lastKey(path),
      );
    },
  };
}

function guestsForm(plan: EventDoc, op: OpOf<"set_guests">): OpForm {
  const guests = { ...plan.guests, ...op.guests };
  const max = LIMITS.maxGuests;
  return {
    fields: [
      { kind: "number", name: "total", label: "Total guests", min: LIMITS.minGuests, max },
      { kind: "number", name: "kids", label: "Kids (under 12)", min: 0, max, optional: true },
      { kind: "number", name: "elderly", label: "Elderly (65+)", min: 0, max, optional: true },
    ],
    values: {
      total: String(guests.total),
      kids: guests.kids === null ? "" : String(guests.kids),
      elderly: guests.elderly === null ? "" : String(guests.elderly),
    },
    build: (next) =>
      parsed(
        {
          type: "set_guests",
          guests: {
            total: number(str(next, "total")),
            kids: nullableCount(str(next, "kids")),
            elderly: nullableCount(str(next, "elderly")),
          },
        },
        lastKey,
      ),
  };
}

/** The editor for `op`, pre-filled; null for ops that are accepted or declined as they are. */
export function editFormFor(op: PlanOperation, plan: EventDoc, today: string): OpForm | null {
  switch (op.type) {
    case "add_task":
    case "update_task":
      return taskForm(plan, op, today);
    case "add_idea":
    case "update_idea":
      return ideaForm(plan, op);
    case "adjust_budget_category":
    case "add_budget_category":
    case "remove_budget_category":
    case "set_budget_note":
    case "set_total_budget":
    case "set_budget_lines":
      return budgetForm(plan, op);
    case "add_function":
    case "move_function":
    case "set_function_share":
      return functionForm(plan, op, today);
    case "add_vendor":
    case "update_vendor":
    case "set_vendor_status":
      return vendorForm(plan, op);
    case "set_guests":
      return guestsForm(plan, op);
    case "set_details":
      return op.eventDate === undefined
        ? null
        : {
            fields: [{ kind: "date", name: "eventDate", label: "Event date", min: today, max: addDays(today, LIMITS.maxPlanningDays) }],
            values: { eventDate: op.eventDate },
            build: (next) => parsed({ type: "set_details", eventDate: str(next, "eventDate") }, lastKey),
          };
    default:
      return null;
  }
}

/** Fields that are shown for the current values (conditional due-date fields). */
export function visibleFields(fields: FieldSpec[], values: FormValues): FieldSpec[] {
  return fields.filter((field) => !field.showWhen || field.showWhen.values.includes(str(values, field.showWhen.name)));
}

/** The date a task op makes it due (shown live under the due fields, spec 10.9 note 3). */
export function opDueDate(op: { daysBefore?: number; date?: string | null }, eventDate: string): string | null {
  if (op.date) return op.date;
  return op.daysBefore === undefined ? null : addDays(eventDate, -op.daysBefore);
}
