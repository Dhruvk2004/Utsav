import { formatInr } from "./budget";
import { addDays, daysBetween, formatShortDate, formatTime, formatWeekdayDate, offsetLabel } from "./dates";
import { REVIEW_SECTION_LABELS, VENDOR_STATUS_LABELS } from "./labels";
import type { EventDoc, FunctionDoc, IdeaFields, TaskDoc } from "./model/event";
import { moneyOf } from "./money";
import type { OpOf, PlanOperation } from "./ops/schema";
import { idealDueDate } from "./stats";
import { dueDateFor } from "./timeline";

/**
 * `describeOperation` (spec 12.2): the code-built title and diff rows of a suggestion card. Every
 * figure comes from the plan before and after a dry run, never from model text. `after` is null
 * when the op does not apply, so the card still gets a title.
 */

export type DeltaTone = "less" | "more" | "neutral";

export interface DiffRow {
  label: string;
  before: string | null;
  after: string;
  /** Shown in a pill; `label` is its accessible wording ("₹60,000 less"). */
  delta?: { text: string; tone: DeltaTone; label: string };
  total?: boolean;
}

export interface CardDiff {
  title: string;
  rows: DiffRow[];
  notes: string[];
}

const MINUS = "−";
const inr = formatInr;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function moneyDelta(before: number, after: number): DiffRow["delta"] {
  const d = after - before;
  if (d === 0) return undefined;
  return {
    text: `${d < 0 ? MINUS : "+"}${inr(Math.abs(d))}`,
    tone: d < 0 ? "less" : "more",
    label: `${inr(Math.abs(d))} ${d < 0 ? "less" : "more"}`,
  };
}

function moneyRow(label: string, before: number | null, after: number, total = false): DiffRow {
  return {
    label,
    before: before === null ? null : inr(before),
    after: inr(after),
    delta: before === null ? undefined : moneyDelta(before, after),
    total,
  };
}

function nameList(names: string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
}

const lineOf = (plan: EventDoc, id: string) => plan.budget.lines.find((line) => line.id === id);
const fnOf = (plan: EventDoc, id: string) => plan.functions.find((fn) => fn.id === id);
const taskOf = (plan: EventDoc, id: string) => plan.tasks.find((task) => task.id === id);
const vendorOf = (plan: EventDoc, id: string) => plan.vendors.find((vendor) => vendor.id === id);
const added = <T extends { id: string }>(before: T[], after: T[]) => after.find((item) => !before.some((b) => b.id === item.id));

/** "≈ ₹6,000 (estimate)" or "≈ ₹350 per guest (estimate)" (spec 6.12): AI costs are always marked. */
export function estimateText(cost: number, basis: IdeaFields["costBasis"]): string {
  return `≈ ${inr(cost)}${basis === "per event" ? "" : ` ${basis}`} (estimate)`;
}

/** "Fri 25 Dec · 7:00 pm – 11:00 pm". */
export function functionWhen(fn: Pick<FunctionDoc, "date" | "startTime" | "endTime">): string {
  const time = fn.startTime && fn.endTime ? ` · ${formatTime(fn.startTime)} – ${formatTime(fn.endTime)}` : "";
  return `${formatShortDate(fn.date)}${time}`;
}

/** "Thu 5 Nov · 1 day before" for a task as it would be scheduled today. */
export function taskDue(task: Pick<TaskDoc, "pinnedDate" | "daysBefore">, eventDate: string, today: string): string {
  const ideal = idealDueDate(task, eventDate);
  const { dueDate } = dueDateFor(eventDate, today, daysBetween(ideal, eventDate));
  return `${formatShortDate(dueDate)} · ${offsetLabel(daysBetween(dueDate, eventDate)).toLowerCase()}`;
}

function changedLines(before: EventDoc, after: EventDoc, except: string): number {
  return after.budget.lines.filter((line) => line.id !== except && lineOf(before, line.id)?.amount !== line.amount).length;
}

function adjustTitle(category: string, op: OpOf<"adjust_budget_category">): string {
  if (op.mode === "set_amount") return `Set ${category} to ${inr(op.value)}`;
  const verb = op.value < 0 ? "Reduce" : "Increase";
  const by = op.mode === "percent_change" ? `${Math.abs(op.value)}%` : inr(Math.abs(op.value));
  return `${verb} ${category} by ${by}`;
}

function describeAdjust(before: EventDoc, after: EventDoc | null, op: OpOf<"adjust_budget_category">): CardDiff {
  const line = lineOf(before, op.lineId);
  const diff: CardDiff = { title: adjustTitle(line?.category ?? "a budget category", op), rows: [], notes: [] };
  if (!after || !line) return diff;
  diff.rows.push(moneyRow(line.category, line.amount, lineOf(after, line.id)?.amount ?? 0));
  if (op.rebalance === "change_total") diff.rows.push(moneyRow("Total", before.budget.total, after.budget.total, true));
  else if (op.rebalance === "to_contingency") {
    const contingency = after.budget.lines.find((l) => l.id !== line.id && lineOf(before, l.id)?.amount !== l.amount);
    if (contingency) diff.rows.push(moneyRow(contingency.category, lineOf(before, contingency.id)?.amount ?? 0, contingency.amount));
  } else {
    diff.notes.push(
      `${plural(changedLines(before, after, line.id), "other category", "other categories")} adjusted; total unchanged at ${inr(after.budget.total)}.`,
    );
  }
  return diff;
}

function describeAddLine(before: EventDoc, after: EventDoc | null, op: OpOf<"add_budget_category">): CardDiff {
  const diff: CardDiff = { title: `Add budget category: ${op.category}`, rows: [], notes: [] };
  if (!after) return diff;
  const line = added(before.budget.lines, after.budget.lines);
  diff.rows.push(moneyRow(op.category, null, line?.amount ?? op.amount));
  if (op.fundFrom === "increase_total") diff.rows.push(moneyRow("Total", before.budget.total, after.budget.total, true));
  else {
    const others = after.budget.lines.filter((l) => l.id !== line?.id && lineOf(before, l.id)?.amount !== l.amount);
    if (op.fundFrom === "contingency" && others[0])
      diff.rows.push(moneyRow(others[0].category, lineOf(before, others[0].id)?.amount ?? 0, others[0].amount));
    else diff.notes.push(`${plural(others.length, "other category", "other categories")} adjusted; total unchanged.`);
  }
  return diff;
}

function describeRemoveLine(before: EventDoc, after: EventDoc | null, op: OpOf<"remove_budget_category">): CardDiff {
  const line = lineOf(before, op.lineId);
  const diff: CardDiff = { title: `Remove budget category: ${line?.category ?? "unknown"}`, rows: [], notes: [] };
  if (!after || !line) return diff;
  const target = after.budget.lines.find((l) => lineOf(before, l.id)?.amount !== l.amount);
  diff.rows.push({ label: line.category, before: inr(line.amount), after: "Removed" });
  if (target) diff.rows.push(moneyRow(target.category, lineOf(before, target.id)?.amount ?? 0, target.amount));
  const moved = before.vendors.filter((vendor) => vendor.budgetLineId === line.id).map((vendor) => vendor.category);
  if (moved.length > 0 && target) diff.notes.push(`${plural(moved.length, "vendor")} move to ${target.category}: ${nameList(moved)}.`);
  return diff;
}

function describeBudgetLines(before: EventDoc, after: EventDoc | null, op: OpOf<"set_budget_lines">): CardDiff {
  const total = op.lines.reduce((sum, row) => sum + row.amount, 0);
  const diff: CardDiff = { title: `Re-plan the budget for ${inr(total)}`, rows: [], notes: [] };
  if (!after) return diff;
  for (const line of after.budget.lines) {
    const old = lineOf(before, line.id)?.amount ?? 0;
    if (old !== line.amount) diff.rows.push(moneyRow(line.category, old, line.amount));
  }
  diff.rows.push(moneyRow("Total", before.budget.total, after.budget.total, true));
  return diff;
}

function functionNotes(before: EventDoc, after: EventDoc, except: string | null): string[] {
  const others = after.functions.filter((fn) => fn.id !== except && fnOf(before, fn.id)?.sharePercent !== fn.sharePercent);
  return others.length > 0
    ? [`Other shares rebalanced to total 100%: ${others.map((fn) => `${fn.name} ${fn.sharePercent}%`).join(", ")}.`]
    : [];
}

function describeFunctionOp(
  before: EventDoc,
  after: EventDoc | null,
  op: OpOf<"add_function" | "move_function" | "set_function_share" | "remove_function">,
  today: string,
): CardDiff {
  if (op.type === "add_function") {
    const diff: CardDiff = { title: `Add function: ${op.name}`, rows: [], notes: [] };
    const fn = after && added(before.functions, after.functions);
    if (!after || !fn) return diff;
    diff.rows.push(
      { label: "When", before: null, after: functionWhen(fn) },
      { label: "Share", before: null, after: `${fn.sharePercent}% · ${inr(fn.amount)}` },
    );
    diff.notes.push(...functionNotes(before, after, fn.id));
    return diff;
  }
  const fn = fnOf(before, op.functionId);
  const name = fn?.name ?? "a function";
  if (op.type === "remove_function") {
    const diff: CardDiff = { title: `Remove function: ${name}`, rows: [], notes: [] };
    if (!after || !fn) return diff;
    diff.rows.push({ label: "Share", before: `${fn.sharePercent}%`, after: "Removed" });
    const linked = [
      ...before.tasks.filter((t) => t.functionId === fn.id).map((t) => t.title),
      ...before.vendors.filter((v) => v.functionIds.includes(fn.id)).map((v) => v.category),
    ];
    diff.notes.push(
      linked.length > 0 ? `Linked tasks and vendors will be unlinked: ${nameList(linked)}.` : "Nothing is linked to it.",
      ...functionNotes(before, after, null),
    );
    return diff;
  }
  const next = after && fn ? fnOf(after, fn.id) : undefined;
  if (op.type === "set_function_share") {
    const diff: CardDiff = { title: `Set ${name}'s share to ${op.percent}%`, rows: [], notes: [] };
    if (!after || !fn || !next) return diff;
    diff.rows.push(
      { label: "Share", before: `${fn.sharePercent}%`, after: `${next.sharePercent}%` },
      moneyRow("Amount", fn.amount, next.amount),
    );
    diff.notes.push(...functionNotes(before, after, fn.id));
    return diff;
  }
  const diff: CardDiff = { title: `Move ${name}`, rows: [], notes: [] };
  if (!after || !fn || !next) return diff;
  diff.title = next.date === fn.date ? `Change the time of ${name}` : `Move ${name} to ${formatShortDate(next.date)}`;
  diff.rows.push({ label: "When", before: functionWhen(fn), after: functionWhen(next) });
  const shift = daysBetween(fn.date, next.date);
  const linked = before.tasks.filter((t) => t.functionId === fn.id && t.pinnedDate === null && !t.done);
  if (shift !== 0 && linked.length > 0) {
    diff.notes.push(`${plural(linked.length, "linked task")} move ${plural(Math.abs(shift), "day")} ${shift < 0 ? "earlier" : "later"}.`);
  }
  if (next.date < today) diff.notes.push("That date has passed.");
  return diff;
}

function describeTaskOp(
  before: EventDoc,
  after: EventDoc | null,
  op: OpOf<"add_task" | "update_task" | "remove_task">,
  today: string,
): CardDiff {
  const eventDate = before.details.eventDate;
  if (op.type === "add_task") {
    const diff: CardDiff = { title: `Add task: ${op.title}`, rows: [], notes: [] };
    const task = after && added(before.tasks, after.tasks);
    if (!task) return diff;
    diff.rows.push({ label: "Due", before: null, after: taskDue(task, eventDate, today) });
    const fn = task.functionId ? fnOf(before, task.functionId) : undefined;
    if (fn) diff.rows.push({ label: "Function", before: null, after: fn.name });
    return diff;
  }
  const task = taskOf(before, op.taskId);
  const title = task?.title ?? "a task";
  if (op.type === "remove_task") return { title: `Remove task: ${title}`, rows: [], notes: after ? ["This task will be deleted."] : [] };
  const onlyDone = op.done !== undefined && Object.keys(op).length === 3;
  const diff: CardDiff = {
    title: onlyDone ? `${op.done ? "Mark done" : "Mark not done"}: ${title}` : `Update task: ${title}`,
    rows: [],
    notes: [],
  };
  const next = after && task ? taskOf(after, task.id) : undefined;
  if (!task || !next) return diff;
  if (next.title !== task.title) diff.rows.push({ label: "Title", before: task.title, after: next.title });
  if (next.category !== task.category) diff.rows.push({ label: "Category", before: task.category, after: next.category });
  const [was, now] = [taskDue(task, eventDate, today), taskDue(next, eventDate, today)];
  if (was !== now) diff.rows.push({ label: "Due", before: was, after: now });
  if (next.done !== task.done)
    diff.rows.push({ label: "Status", before: task.done ? "Done" : "To do", after: next.done ? "Done" : "To do" });
  return diff;
}

function describeVendorOp(
  before: EventDoc,
  after: EventDoc | null,
  op: OpOf<"add_vendor" | "update_vendor" | "set_vendor_status" | "remove_vendor">,
): CardDiff {
  const lineName = (plan: EventDoc, id: string | null) => (id ? (lineOf(plan, id)?.category ?? "Unknown") : "None");
  if (op.type === "add_vendor") {
    const diff: CardDiff = { title: `Add vendor: ${op.category}`, rows: [], notes: [] };
    if (!after) return diff;
    const bookBy = addDays(before.details.eventDate, -op.bookByDaysBefore);
    diff.rows.push(
      { label: "Budget line", before: null, after: lineName(before, op.budgetLineId ?? null) },
      { label: "Book by", before: null, after: `${formatShortDate(bookBy)} · ${offsetLabel(op.bookByDaysBefore).toLowerCase()}` },
    );
    if (op.questions?.length) diff.notes.push(`${plural(op.questions.length, "question")} to ask.`);
    return diff;
  }
  const vendor = vendorOf(before, op.vendorId);
  const category = vendor?.category ?? "a vendor";
  if (op.type === "remove_vendor") {
    return {
      title: `Remove vendor: ${category}`,
      rows: [],
      notes: after ? ["Notes, amounts and drafts for this vendor will be deleted."] : [],
    };
  }
  const next = after && vendor ? vendorOf(after, vendor.id) : undefined;
  if (op.type === "set_vendor_status") {
    const diff: CardDiff = { title: `Mark ${category} as ${VENDOR_STATUS_LABELS[op.status].toLowerCase()}`, rows: [], notes: [] };
    if (!vendor || !next || !after) return diff;
    diff.rows.push({ label: "Status", before: VENDOR_STATUS_LABELS[vendor.status], after: VENDOR_STATUS_LABELS[next.status] });
    if (next.quotedAmount !== vendor.quotedAmount && next.quotedAmount !== null)
      diff.rows.push(moneyRow("Quoted", vendor.quotedAmount, next.quotedAmount));
    if (next.paidAmount !== vendor.paidAmount) diff.rows.push(moneyRow("Paid", vendor.paidAmount, next.paidAmount));
    const [was, now] = [moneyOf(before).committed, moneyOf(after).committed];
    if (was !== now) diff.rows.push(moneyRow("Committed", was, now, true));
    return diff;
  }
  const diff: CardDiff = { title: `Update ${category}`, rows: [], notes: [] };
  if (!vendor || !next) return diff;
  if (next.notes !== vendor.notes) diff.rows.push({ label: "Notes", before: vendor.notes || null, after: next.notes || "None" });
  if (next.questions.join() !== vendor.questions.join())
    diff.rows.push({ label: "Questions", before: String(vendor.questions.length), after: String(next.questions.length) });
  if (next.budgetLineId !== vendor.budgetLineId)
    diff.rows.push({ label: "Budget line", before: lineName(before, vendor.budgetLineId), after: lineName(before, next.budgetLineId) });
  if (next.functionIds.join() !== vendor.functionIds.join()) {
    const names = (ids: string[]) => ids.map((id) => fnOf(before, id)?.name ?? id).join(", ") || "None";
    diff.rows.push({ label: "Functions", before: names(vendor.functionIds), after: names(next.functionIds) });
  }
  return diff;
}

function describeGuests(before: EventDoc, after: EventDoc | null, op: OpOf<"set_guests">): CardDiff {
  const g = op.guests;
  const title =
    g.total !== undefined
      ? `Set guests to ${g.total}`
      : g.kids != null
        ? `Set kids to ${g.kids}`
        : g.elderly != null
          ? `Set elderly guests to ${g.elderly}`
          : "Update guest counts";
  const diff: CardDiff = { title, rows: [], notes: [] };
  if (!after) return diff;
  const count = (n: number | null) => (n === null ? "Not set" : String(n));
  for (const [key, label] of [
    ["total", "Guests"],
    ["kids", "Kids"],
    ["elderly", "Elderly"],
  ] as const) {
    if (before.guests[key] !== after.guests[key])
      diff.rows.push({ label, before: count(before.guests[key]), after: count(after.guests[key]) });
  }
  if (before.guests.total !== after.guests.total) {
    const per = (guests: number) => Math.floor(after.budget.total / guests);
    diff.rows.push(moneyRow("Per guest", per(before.guests.total), per(after.guests.total)));
  }
  return diff;
}

function describeDate(before: EventDoc, after: EventDoc | null, op: OpOf<"set_details">): CardDiff {
  if (op.eventDate === undefined) return { title: "Update event details", rows: [], notes: [] };
  const diff: CardDiff = { title: `Move the event date to ${formatWeekdayDate(op.eventDate)}`, rows: [], notes: [] };
  if (!after) return diff;
  const shift = daysBetween(before.details.eventDate, after.details.eventDate);
  diff.rows.push({
    label: "Date",
    before: formatWeekdayDate(before.details.eventDate),
    after: formatWeekdayDate(after.details.eventDate),
    delta: {
      text: `${shift < 0 ? MINUS : "+"}${plural(Math.abs(shift), "day")}`,
      tone: "neutral",
      label: `${plural(Math.abs(shift), "day")} ${shift < 0 ? "earlier" : "later"}`,
    },
  });
  const open = before.tasks.filter((t) => !t.done && t.pinnedDate === null).length;
  diff.notes.push(`${plural(open, "open task")} and ${plural(before.functions.length, "function")} move with it.`);
  return diff;
}

const SECTION_COUNTS: Record<OpOf<"reset_section">["section"], { label: string; count: (plan: EventDoc) => number }> = {
  budget: { label: "Categories", count: (plan) => plan.budget.lines.length },
  timeline: { label: "Tasks", count: (plan) => plan.tasks.length },
  vendors: { label: "Vendors", count: (plan) => plan.vendors.length },
  ideas: { label: "Ideas", count: (plan) => plan.ideas.length },
};

/** Titles for ops that only the user makes by hand (no card, but they name the Undo toast). */
function manualTitle(before: EventDoc, op: PlanOperation): string {
  switch (op.type) {
    case "rename_budget_category":
      return `Rename ${lineOf(before, op.lineId)?.category ?? "category"} to ${op.category}`;
    case "rename_function":
      return `Rename ${fnOf(before, op.functionId)?.name ?? "function"} to ${op.name}`;
    case "save_draft":
      return "Save the enquiry draft";
    case "remove_draft":
      return "Delete the enquiry draft";
    case "save_idea":
    case "update_idea":
    case "remove_idea": {
      const title = before.ideas.find((idea) => idea.id === op.ideaId)?.title ?? "idea";
      return `${{ save_idea: "Save idea", update_idea: "Edit idea", remove_idea: "Remove idea" }[op.type]}: ${title}`;
    }
    case "clear_dismissed_ideas":
      return "Clear dismissed ideas";
    case "set_personalisation":
      return "Update personalisation";
    case "set_summary":
      return "Edit the summary";
    default:
      return "Update the plan";
  }
}

export function describeOperation(before: EventDoc, after: EventDoc | null, op: PlanOperation, today: string): CardDiff {
  switch (op.type) {
    case "adjust_budget_category":
      return describeAdjust(before, after, op);
    case "add_budget_category":
      return describeAddLine(before, after, op);
    case "remove_budget_category":
      return describeRemoveLine(before, after, op);
    case "set_budget_note": {
      const line = lineOf(before, op.lineId);
      const rows = after && line ? [{ label: "Note", before: line.note || null, after: op.note || "None" }] : [];
      return { title: `Note on ${line?.category ?? "a budget category"}`, rows, notes: [] };
    }
    case "set_total_budget":
      return {
        title: `Set the total budget to ${inr(op.total)}`,
        rows: after ? [moneyRow("Total", before.budget.total, after.budget.total, true)] : [],
        notes: after ? ["Every category is rescaled in proportion."] : [],
      };
    case "set_budget_lines":
      return describeBudgetLines(before, after, op);
    case "add_function":
    case "move_function":
    case "set_function_share":
    case "remove_function":
      return describeFunctionOp(before, after, op, today);
    case "add_task":
    case "update_task":
    case "remove_task":
      return describeTaskOp(before, after, op, today);
    case "add_vendor":
    case "update_vendor":
    case "set_vendor_status":
    case "remove_vendor":
      return describeVendorOp(before, after, op);
    case "add_idea": {
      const cost = op.idea.estimatedCost;
      const rows = cost === null ? [] : [{ label: "Estimate", before: null, after: estimateText(cost, op.idea.costBasis) }];
      return { title: `Idea: ${op.idea.title}`, rows, notes: op.idea.description ? [op.idea.description] : [] };
    }
    case "set_guests":
      return describeGuests(before, after, op);
    case "set_details":
      return describeDate(before, after, op);
    case "reset_section": {
      const { label, count } = SECTION_COUNTS[op.section];
      const rows = after ? [{ label, before: String(count(before)), after: String(count(after)) }] : [];
      return {
        title: `Reset ${REVIEW_SECTION_LABELS[op.section]} to the starter template`,
        rows,
        notes: after ? ["Items you added, edited or finished are kept."] : [],
      };
    }
    default:
      return { title: manualTitle(before, op), rows: [], notes: [] };
  }
}

/** The proposal item `summary` (spec 6.3 previous turns): title plus its first change. */
export function summaryOf(diff: CardDiff): string {
  const first = diff.rows[0];
  const change = first?.before ? ` (${first.before} -> ${first.after})` : "";
  return `${diff.title}${change}`.slice(0, 300);
}
