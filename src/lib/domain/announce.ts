import { formatInr } from "./budget";
import { describeOperation } from "./describe";
import type { EventDoc } from "./model/event";
import type { PlanOperation } from "./ops/schema";

/**
 * `announceChange` (spec 5.4, 9.2): the one sentence the polite live region reads after a save,
 * built by code from the plan before and after, e.g. "Saved. Decor set to ₹2,50,000. Venue and
 * 4 other categories adjusted; total unchanged at ₹25,00,000."
 */

/** Ids of budget lines (or functions) whose amount (or share) changed, other than the edited one. */
export function adjustedIds(before: EventDoc, after: EventDoc, editedId: string): string[] {
  const lineBefore = new Map(before.budget.lines.map((line) => [line.id, line.amount]));
  const fnBefore = new Map(before.functions.map((fn) => [fn.id, fn.sharePercent]));
  return [
    ...after.budget.lines.filter((line) => lineBefore.has(line.id) && lineBefore.get(line.id) !== line.amount).map((line) => line.id),
    ...after.functions.filter((fn) => fnBefore.has(fn.id) && fnBefore.get(fn.id) !== fn.sharePercent).map((fn) => fn.id),
  ].filter((id) => id !== editedId);
}

function others(names: string[], noun: [string, string]): string {
  if (names.length === 1) return names[0];
  const rest = names.length - 1;
  return `${names[0]} and ${rest} other ${rest === 1 ? noun[0] : noun[1]}`;
}

function budgetSentence(before: EventDoc, after: EventDoc, lineId: string): string {
  const line = after.budget.lines.find((l) => l.id === lineId);
  if (!line) return "";
  const parts = [`${line.category} set to ${formatInr(line.amount)}.`];
  const moved = adjustedIds(before, after, lineId).flatMap((id) => after.budget.lines.filter((l) => l.id === id).map((l) => l.category));
  if (before.budget.total !== after.budget.total) {
    parts.push(`Total is now ${formatInr(after.budget.total)}${after.functions.length > 0 ? "; function amounts updated" : ""}.`);
  } else if (moved.length > 0) {
    parts.push(`${others(moved, ["category", "categories"])} adjusted; total unchanged at ${formatInr(after.budget.total)}.`);
  }
  return parts.join(" ");
}

function shareSentence(before: EventDoc, after: EventDoc, functionId: string): string {
  const fn = after.functions.find((f) => f.id === functionId);
  if (!fn) return "";
  const moved = adjustedIds(before, after, functionId).flatMap((id) => after.functions.filter((f) => f.id === id).map((f) => f.name));
  const rest = moved.length > 0 ? ` ${others(moved, ["function", "functions"])} adjusted; shares total 100%.` : "";
  return `${fn.name} share set to ${fn.sharePercent}% (${formatInr(fn.amount)}).${rest}`;
}

export function announceChange(before: EventDoc, after: EventDoc, op: PlanOperation, today: string): string {
  let detail: string;
  if (op.type === "adjust_budget_category") detail = budgetSentence(before, after, op.lineId);
  else if (op.type === "set_function_share") detail = shareSentence(before, after, op.functionId);
  else detail = `${describeOperation(before, after, op, today).title}.`;
  return `Saved. ${detail}`.trim();
}
