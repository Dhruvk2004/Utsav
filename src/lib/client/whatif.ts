import { allocate, formatInr, rebalancePinned, rescaleBudget } from "@/lib/domain/budget";
import type { EventDoc } from "@/lib/domain/model/event";
import { committedByLine } from "@/lib/domain/money";
import { resolveName } from "@/lib/domain/resolve";
import type { OpOf } from "@/lib/domain/ops/schema";

/**
 * The What-if table (spec 6.4): rows start from Simple rescale (code only) or Smart re-plan
 * (model weights, allocated by code). Editing an "After" amount pins that row; unticking
 * "Include" keeps the row's old amount; the other included, unpinned rows are rebalanced so the
 * total still equals the new total, or the gap is reported and Apply stays disabled. A protected
 * row never drops below its old amount, whichever option made the rows and whichever row the
 * user pinned (CO-03, MQW-03, BP-02).
 */

export type RowStatus = "protected" | "raised" | "guarded" | "edited" | "adjusted" | "excluded" | null;

export interface WhatIfRow {
  lineId: string;
  category: string;
  before: number;
  after: number;
  /** Relative weight used when the row absorbs a change (its starting "After" amount). */
  weight: number;
  committed: number;
  included: boolean;
  pinned: boolean;
  /** "Protect (never decrease)": a rebalance never takes this row below `before`. */
  protected: boolean;
  status: RowStatus;
  /** Smart rows the model re-weighted carry the AI origin tag. */
  ai: boolean;
}

export interface SmartLine {
  category: string;
  percent: number;
}

function startRows(plan: EventDoc, amounts: number[], protect: readonly string[], ai: boolean[] = []): WhatIfRow[] {
  const committed = committedByLine(plan);
  return plan.budget.lines.map((line, i) => ({
    lineId: line.id,
    category: line.category,
    before: line.amount,
    after: amounts[i],
    weight: amounts[i],
    committed: committed.get(line.id) ?? 0,
    included: true,
    pinned: false,
    protected: protect.includes(line.id),
    status: null,
    ai: ai[i] ?? false,
  }));
}

/**
 * Splits `amount` over `rows` by weight, but no protected row goes below its old amount: such a
 * row is fixed at its floor and the rest is split again. Null when the floors alone don't fit.
 */
function spreadWithFloors(amount: number, rows: readonly WhatIfRow[]): number[] | null {
  const fixed = new Map<number, number>();
  for (;;) {
    const open = rows.map((_, i) => i).filter((i) => !fixed.has(i));
    const rest = amount - [...fixed.values()].reduce((a, b) => a + b, 0);
    if (rest < 0 || (open.length === 0 && rest !== 0)) return null;
    const spread =
      open.length > 0
        ? allocate(
            rest,
            open.map((i) => rows[i].weight),
          )
        : [];
    const below = open.filter((i, k) => rows[i].protected && spread[k] < rows[i].before);
    if (below.length === 0) return rows.map((_, i) => fixed.get(i) ?? spread[open.indexOf(i)]);
    for (const i of below) fixed.set(i, rows[i].before);
  }
}

/**
 * Raises every protected row that would decrease back to its old amount ("Adjusted by Utsav to
 * protect ...") and spreads the rest over the other rows. When the protected rows alone exceed
 * the new total, they still keep their amounts and the gap message explains the difference.
 */
export function protectRows(rows: WhatIfRow[], newTotal: number): WhatIfRow[] {
  const cut = (row: WhatIfRow) => row.protected && row.after < row.before;
  const marked = rows.map((row): WhatIfRow =>
    row.protected && row.status === null ? { ...row, status: cut(row) ? "raised" : "protected" } : row,
  );
  if (!marked.some(cut)) return marked;
  const free = marked.filter((row) => !cut(row));
  const rest = newTotal - marked.reduce((sum, row) => sum + (cut(row) ? row.before : 0), 0);
  const spread = rest >= 0 ? spreadWithFloors(rest, free) : null;
  return marked.map((row) => {
    if (cut(row)) return { ...row, after: row.before, weight: row.before };
    const after = spread ? spread[free.indexOf(row)] : row.after;
    return { ...row, after, weight: after };
  });
}

/**
 * Simple rescale: every category in proportion (`rescaleBudget`), except that protected rows keep
 * their old amount when the rescale would cut them and the others absorb the difference.
 */
export function simpleRows(plan: EventDoc, newTotal: number, protect: readonly string[] = []): WhatIfRow[] {
  const lines = plan.budget.lines.map((line) => ({ category: line.category, note: line.note, amount: line.amount, percent: line.percent }));
  return protectRows(
    startRows(
      plan,
      rescaleBudget(lines, newTotal).map((line) => line.amount),
      protect,
    ),
    newTotal,
  );
}

/** Resolves a model category to a plan line: exact name first, then a unique prefix (spec 6.3). */
export function resolveLine(plan: EventDoc, category: string): string | null {
  const resolved = resolveName(plan.budget.lines, (line) => line.category, category, "budget category");
  return resolved.ok ? resolved.id : null;
}

/**
 * Smart re-plan (`whatifToOperation`, spec 6.4): model weights re-weight the existing lines only.
 * Unknown categories are ignored and listed; omitted ones keep their current percent; protected
 * lines may not decrease and no line goes below what is already committed.
 */
export function smartRows(
  plan: EventDoc,
  newTotal: number,
  lines: SmartLine[],
  protect: string[],
): { rows: WhatIfRow[]; ignored: string[] } {
  const weights = new Map<string, number>();
  const ignored: string[] = [];
  for (const line of lines) {
    const id = resolveLine(plan, line.category);
    if (!id) ignored.push(line.category);
    else if (!weights.has(id)) weights.set(id, Math.max(0, line.percent));
  }
  const planLines = plan.budget.lines;
  const amounts = allocate(
    newTotal,
    planLines.map((line) => weights.get(line.id) ?? line.percent),
  );
  const rows = startRows(
    plan,
    amounts,
    protect,
    planLines.map((line) => weights.has(line.id)),
  );
  const pins: Record<string, number> = {};
  for (const row of rows) {
    const floor = Math.max(row.committed, protect.includes(row.lineId) ? row.before : 0);
    if (row.after < floor) {
      pins[row.lineId] = floor;
      row.status = protect.includes(row.lineId) && row.before >= row.committed ? "raised" : "guarded";
    } else if (protect.includes(row.lineId)) row.status = "protected";
  }
  const settled = rebalancePinned(
    rows.map((row) => ({ id: row.lineId, amount: row.after })),
    pins,
    newTotal,
  );
  if (settled) rows.forEach((row, i) => Object.assign(row, { after: settled[i].amount, weight: settled[i].amount }));
  return { rows, ignored };
}

/**
 * Re-spreads the new total over included, unpinned rows; excluded rows keep their old amount and
 * protected rows never go below theirs (BP-02).
 */
function rebalance(rows: WhatIfRow[], newTotal: number): WhatIfRow[] {
  const fixed = rows.filter((row) => !row.included || row.pinned);
  const free = rows.filter((row) => row.included && !row.pinned);
  const rest = newTotal - fixed.reduce((sum, row) => sum + (row.included ? row.after : row.before), 0);
  const spread = rest < 0 || free.length === 0 ? null : spreadWithFloors(rest, free);
  if (!spread) {
    return rows.map((row) => (row.included ? row : { ...row, after: row.before }));
  }
  return rows.map((row) => {
    if (!row.included) return { ...row, after: row.before, status: "excluded" };
    if (row.pinned) return row;
    const after = spread[free.indexOf(row)];
    return { ...row, after, status: after !== row.after && row.status === null ? "adjusted" : row.status };
  });
}

export function editAfter(rows: WhatIfRow[], lineId: string, amount: number, newTotal: number): WhatIfRow[] {
  const next = rows.map((row) =>
    row.lineId === lineId ? { ...row, after: amount, pinned: true, included: true, status: "edited" as const } : row,
  );
  return rebalance(next, newTotal);
}

export function setIncluded(rows: WhatIfRow[], lineId: string, included: boolean, newTotal: number): WhatIfRow[] {
  const next = rows.map((row) =>
    row.lineId === lineId ? { ...row, included, pinned: false, status: included ? null : ("excluded" as const) } : row,
  );
  return rebalance(next, newTotal);
}

export function rowsTotal(rows: WhatIfRow[]): number {
  return rows.reduce((sum, row) => sum + row.after, 0);
}

/** Why Apply is disabled, or null when the rows add up to the new total. */
export function gapMessage(rows: WhatIfRow[], newTotal: number): string | null {
  const total = rowsTotal(rows);
  if (total === newTotal) return null;
  return `Adjust one more row so the total is ${formatInr(newTotal)} (currently ${formatInr(total)}).`;
}

export function statusText(row: WhatIfRow): string | null {
  if (row.after < row.committed) return `Cannot go below ${formatInr(row.committed)} committed`;
  switch (row.status) {
    case "protected":
      return "Protected";
    case "raised":
      return `Adjusted by Utsav to protect ${row.category}`;
    case "guarded":
      return `Kept at ${formatInr(row.committed)} already committed`;
    case "edited":
      return "Edited by you";
    case "adjusted":
      return "Adjusted";
    case "excluded":
      return "Not included";
    default:
      return null;
  }
}

export function budgetLinesOp(rows: WhatIfRow[]): OpOf<"set_budget_lines"> {
  return { type: "set_budget_lines", lines: rows.map((row) => ({ lineId: row.lineId, amount: row.after })) };
}

/** "Wedding ₹9,90,000 (45%) · Sangeet ₹3,30,000 (15%)": function amounts follow their shares. */
export function functionAmountsText(plan: EventDoc, newTotal: number): string | null {
  if (plan.functions.length === 0) return null;
  const amounts = allocate(
    newTotal,
    plan.functions.map((fn) => fn.sharePercent),
  );
  return plan.functions.map((fn, i) => `${fn.name} ${formatInr(amounts[i])} (${fn.sharePercent}%)`).join(" · ");
}
