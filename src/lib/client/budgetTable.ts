import type { EventDoc } from "@/lib/domain/model/event";
import { contingencyLine } from "@/lib/domain/ops/context";
import type { OpOf } from "@/lib/domain/ops/schema";
import type { PlanView } from "@/lib/domain/view";

/**
 * Budget tab rows (spec 5.4, 10.8): allocation, the money definitions per line from `deriveView`,
 * variance and the over-commit text. Edits become `adjust_budget_category` ops: by default the
 * other rows rebalance to keep the total; in "change the total" mode only the edited row moves.
 */

export type RebalanceMode = "keep_total" | "change_total";

export interface BudgetRow {
  id: string;
  category: string;
  percent: number;
  amount: number;
  committed: number;
  paid: number;
  /** Allocation minus committed; negative means over. */
  variance: number;
  note: string;
  origin: EventDoc["budget"]["lines"][number]["origin"];
  isContingency: boolean;
  vendors: string[];
}

export function budgetRows(plan: EventDoc, view: PlanView): BudgetRow[] {
  const contingency = contingencyLine(plan);
  return plan.budget.lines.map((line) => {
    const money = view.moneyByLine.get(line.id);
    return {
      id: line.id,
      category: line.category,
      percent: line.percent,
      amount: line.amount,
      committed: money?.committed ?? 0,
      paid: money?.paid ?? 0,
      variance: money?.remaining ?? line.amount,
      note: line.note,
      origin: line.origin,
      isContingency: line.id === contingency?.id,
      vendors: plan.vendors.filter((vendor) => vendor.budgetLineId === line.id).map((vendor) => vendor.category),
    };
  });
}

export function amountEditOp(lineId: string, amount: number, mode: RebalanceMode): OpOf<"adjust_budget_category"> {
  return {
    type: "adjust_budget_category",
    lineId,
    mode: "set_amount",
    value: amount,
    rebalance: mode === "keep_total" ? "spread_to_others" : "change_total",
  };
}

/** A typed percent as whole rupees of the current total. */
export function amountForPercent(percent: number, total: number): number {
  return Math.round((percent / 100) * total);
}

export function totalsOf(rows: BudgetRow[]): Pick<BudgetRow, "percent" | "amount" | "committed" | "paid" | "variance"> {
  const sum = (key: "amount" | "committed" | "paid" | "variance") => rows.reduce((total, row) => total + row[key], 0);
  return { percent: 100, amount: sum("amount"), committed: sum("committed"), paid: sum("paid"), variance: sum("variance") };
}
