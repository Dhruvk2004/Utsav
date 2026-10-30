import { sameJson } from "../equality";
import type { PlanOperation, ProposableOpType } from "./schema";

/**
 * Fields the Edit form of each proposable op may change (spec 6.1 table). Target ids
 * (`lineId`, `functionId`, `taskId`, `vendorId`, `ideaId`) are never listed, so they stay
 * fixed; `*` matches every array element. Links on new items (an `add_task` function, an
 * `add_vendor` budget line) are fields of the item being created, not targets, so they are editable.
 */
export const EDITABLE_FIELDS: Record<ProposableOpType, readonly string[]> = {
  adjust_budget_category: ["mode", "value", "rebalance"],
  add_budget_category: ["category", "amount", "fundFrom"],
  remove_budget_category: ["moveToLineId"],
  set_budget_note: ["note"],
  set_total_budget: ["total"],
  set_budget_lines: ["lines.*.amount"],
  add_function: ["name", "date", "dayOffset", "sharePercent", "startTime", "endTime"],
  move_function: ["date", "weekday", "startTime", "endTime"],
  set_function_share: ["percent"],
  remove_function: [],
  add_task: ["title", "category", "functionId", "daysBefore", "date"],
  update_task: ["title", "category", "daysBefore", "date", "done"],
  remove_task: [],
  add_vendor: ["category", "budgetLineId", "functionIds", "bookByDaysBefore", "questions"],
  update_vendor: ["patch.notes", "patch.questions", "patch.budgetLineId", "patch.functionIds"],
  set_vendor_status: ["status", "quotedAmount", "paidAmount"],
  remove_vendor: [],
  add_idea: ["idea.title", "idea.description", "idea.category", "idea.estimatedCost"],
  set_guests: ["guests.total", "guests.kids", "guests.elderly"],
  set_details: ["eventDate"],
  reset_section: [],
};

export const EDIT_REJECTED = "Edit must change this suggestion only";

function omitPath(value: unknown, path: string[]): void {
  if (typeof value !== "object" || value === null) return;
  const [head, ...rest] = path;
  const record = value as Record<string, unknown>;
  if (rest.length === 0) delete record[head];
  else if (head === "*" && Array.isArray(value)) value.forEach((item) => omitPath(item, rest));
  else omitPath(record[head], rest);
}

/** The op with its editable fields removed, i.e. what an edit must keep. */
function frozenPart(op: PlanOperation, fields: readonly string[]): unknown {
  const copy: unknown = structuredClone(op);
  for (const field of fields) omitPath(copy, field.split("."));
  return copy;
}

/** True when `edited` is the same kind of change to the same target, differing only in editable fields. */
export function isFaithfulEdit(original: PlanOperation, edited: PlanOperation): boolean {
  if (original.type !== edited.type || !(original.type in EDITABLE_FIELDS)) return false;
  const fields = EDITABLE_FIELDS[original.type as ProposableOpType];
  return sameJson(frozenPart(original, fields), frozenPart(edited, fields));
}
