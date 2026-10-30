import { allocate, formatInr, rebalancePinned } from "../budget";
import { CAPS, type EventDoc } from "../model/event";
import { LIMITS } from "../schemas";
import { assertUniqueName, contingencyLine, fail, findById, itemOrigin, uniqueId, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/** Budget ops (spec 5.4 and 6.3). They change amounts only; finalize re-derives percents and function amounts. */

function checkTotal(total: number): void {
  if (total < LIMITS.minBudget) fail(`The total budget can't go below ${formatInr(LIMITS.minBudget)}`);
  if (total > LIMITS.maxBudget) fail("The total budget is too large");
}

function setAmounts(plan: EventDoc, rows: { id: string; amount: number }[]): void {
  const byId = new Map(rows.map((row) => [row.id, row.amount]));
  for (const line of plan.budget.lines) line.amount = byId.get(line.id) ?? line.amount;
}

function requireContingency(plan: EventDoc) {
  return contingencyLine(plan) ?? fail("This plan has no Contingency line");
}

export function setTotalBudget(plan: EventDoc, op: OpOf<"set_total_budget">): void {
  const amounts = allocate(
    op.total,
    plan.budget.lines.map((line) => line.amount),
  );
  plan.budget.lines.forEach((line, i) => (line.amount = amounts[i]));
  plan.budget.total = op.total;
}

export function setBudgetLines(plan: EventDoc, op: OpOf<"set_budget_lines">, ctx: ApplyContext): void {
  const existing = new Set(plan.budget.lines.map((line) => line.id));
  const given = new Set(op.lines.map((line) => line.lineId));
  const sameSet = given.size === op.lines.length && given.size === existing.size && [...given].every((id) => existing.has(id));
  if (!sameSet) fail("The new budget must keep exactly the plan's current categories");
  const total = op.lines.reduce((sum, line) => sum + line.amount, 0);
  checkTotal(total);
  for (const row of op.lines) {
    const line = findById(plan.budget.lines, row.lineId, "Budget category");
    line.amount = row.amount;
    if (row.note !== undefined && row.note !== line.note) {
      line.note = row.note;
      line.origin = itemOrigin(ctx);
    }
  }
  plan.budget.total = total;
}

function adjustedAmount(current: number, op: OpOf<"adjust_budget_category">): number {
  if (op.mode === "percent_change") return Math.round(current * (1 + op.value / 100));
  if (!Number.isInteger(op.value)) fail("Use whole rupees");
  return op.mode === "set_amount" ? op.value : current + op.value;
}

export function adjustBudgetCategory(plan: EventDoc, op: OpOf<"adjust_budget_category">): void {
  const line = findById(plan.budget.lines, op.lineId, "Budget category");
  const next = adjustedAmount(line.amount, op);
  if (next < 0) fail(`${line.category} can't go below ₹0`);
  const delta = next - line.amount;

  if (op.rebalance === "change_total") {
    checkTotal(plan.budget.total + delta);
    line.amount = next;
    plan.budget.total += delta;
    return;
  }
  if (op.rebalance === "to_contingency") {
    const contingency = requireContingency(plan);
    if (contingency.id === line.id) fail("Choose another way to balance Contingency");
    if (contingency.amount < delta) fail(`Contingency has only ${formatInr(contingency.amount)}`);
    contingency.amount -= delta;
    line.amount = next;
    return;
  }
  const rows = rebalancePinned(plan.budget.lines, { [line.id]: next }, plan.budget.total);
  if (!rows) fail("The other categories can't cover this change");
  setAmounts(plan, rows);
}

export function addBudgetCategory(plan: EventDoc, op: OpOf<"add_budget_category">, ctx: ApplyContext): void {
  const lines = plan.budget.lines;
  if (lines.length >= CAPS.budgetLines) fail(`A budget can have at most ${CAPS.budgetLines} categories`);
  assertUniqueName(
    lines.map((line) => line.category),
    op.category,
    "a category",
  );
  const id = uniqueId(
    "line",
    op.category,
    lines.map((line) => line.id),
  );
  const line = { id, category: op.category, amount: op.amount, percent: 0, note: "", origin: itemOrigin(ctx) };

  if (op.fundFrom === "contingency") {
    const contingency = requireContingency(plan);
    if (contingency.amount < op.amount) fail(`Contingency has only ${formatInr(contingency.amount)}`);
    contingency.amount -= op.amount;
  } else if (op.fundFrom === "spread") {
    const rows = rebalancePinned([...lines, line], { [id]: op.amount }, plan.budget.total);
    if (!rows) fail("The other categories can't cover this amount");
    setAmounts(plan, rows);
  } else {
    checkTotal(plan.budget.total + op.amount);
    plan.budget.total += op.amount;
  }
  lines.push(line);
}

export function renameBudgetCategory(plan: EventDoc, op: OpOf<"rename_budget_category">, ctx: ApplyContext): void {
  const line = findById(plan.budget.lines, op.lineId, "Budget category");
  if (line === contingencyLine(plan)) fail("Contingency can't be renamed");
  const others = plan.budget.lines.filter((l) => l.id !== line.id).map((l) => l.category);
  assertUniqueName(others, op.category, "a category");
  line.category = op.category;
  line.origin = itemOrigin(ctx);
}

export function removeBudgetCategory(plan: EventDoc, op: OpOf<"remove_budget_category">): void {
  const line = findById(plan.budget.lines, op.lineId, "Budget category");
  const contingency = requireContingency(plan);
  if (line.id === contingency.id) fail("Contingency can't be removed; it keeps the plan safe from surprises");
  const target = op.moveToLineId ? findById(plan.budget.lines, op.moveToLineId, "Budget category") : contingency;
  if (target.id === line.id) fail("Move the amount to a different category");
  target.amount += line.amount;
  for (const vendor of plan.vendors) if (vendor.budgetLineId === line.id) vendor.budgetLineId = target.id;
  plan.budget.lines = plan.budget.lines.filter((l) => l.id !== line.id);
}

export function setBudgetNote(plan: EventDoc, op: OpOf<"set_budget_note">, ctx: ApplyContext): void {
  const line = findById(plan.budget.lines, op.lineId, "Budget category");
  line.note = op.note;
  line.origin = itemOrigin(ctx);
}
