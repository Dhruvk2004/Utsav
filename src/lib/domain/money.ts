import type { EventDoc, VendorDoc } from "./model/event";

/**
 * Money definitions (spec 12.2), the single source for the Overview, Budget and Vendors tabs:
 * - committed: quotes of vendors that are booked or paid;
 * - paid: every payment, whatever the status (deposits often come before "booked");
 * - quotedOpen: quotes still awaiting a decision (status `quoted`);
 * - remaining: allocation minus committed (negative means over budget).
 */
export interface MoneySummary {
  allocated: number;
  committed: number;
  paid: number;
  quotedOpen: number;
  remaining: number;
}

type PlanMoney = Pick<EventDoc, "budget" | "vendors">;

function summarise(allocated: number, vendors: VendorDoc[]): MoneySummary {
  let committed = 0;
  let paid = 0;
  let quotedOpen = 0;
  for (const vendor of vendors) {
    const quote = vendor.quotedAmount ?? 0;
    if (vendor.status === "booked" || vendor.status === "paid") committed += quote;
    if (vendor.status === "quoted") quotedOpen += quote;
    paid += vendor.paidAmount;
  }
  return { allocated, committed, paid, quotedOpen, remaining: allocated - committed };
}

export function moneyOf(plan: PlanMoney): MoneySummary {
  return summarise(plan.budget.total, plan.vendors);
}

/** The same definitions per budget line, over the vendors linked to it. */
export function moneyByLine(plan: PlanMoney): Map<string, MoneySummary> {
  return new Map(
    plan.budget.lines.map((line) => [
      line.id,
      summarise(
        line.amount,
        plan.vendors.filter((vendor) => vendor.budgetLineId === line.id),
      ),
    ]),
  );
}

export function committedByLine(plan: PlanMoney): Map<string, number> {
  return new Map([...moneyByLine(plan)].map(([id, summary]) => [id, summary.committed]));
}

/**
 * Money paid beyond a vendor's quote (CO-07). It is not part of committed (spec 12.2), so the
 * totals call it out next to Remaining instead of letting Remaining hide it.
 */
export function overpaidOf(vendors: readonly Pick<VendorDoc, "quotedAmount" | "paidAmount" | "status">[]): number {
  return vendors.reduce(
    (sum, vendor) =>
      sum + (vendor.status !== "not_needed" && vendor.quotedAmount !== null ? Math.max(0, vendor.paidAmount - vendor.quotedAmount) : 0),
    0,
  );
}
