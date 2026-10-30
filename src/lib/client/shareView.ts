import { formatCount, formatInr } from "@/lib/domain/budget";
import { formatShortDate, formatWeekdayDate } from "@/lib/domain/dates";
import { functionWhen } from "@/lib/domain/describe";
import { defaultEventTitle, VENDOR_STATUS_LABELS } from "@/lib/domain/labels";
import type { VendorStatus } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import { overpaidOf, type MoneySummary } from "@/lib/domain/money";
import type { PlanView } from "@/lib/domain/view";

/**
 * `toSharedView` (spec 10.15, design-system 9.1): what a read-only share link shows. It never
 * carries honoree names, vendor labels, contacts or drafts; amounts and notes only when the
 * owner turned them on; the heading is code-built unless the owner chose to show the title.
 */

export interface ShareOptions {
  showAmounts: boolean;
  showNotes: boolean;
  showTitle: boolean;
}

export interface SharedView {
  heading: string;
  meta: string;
  budgetTotal: string | null;
  functions: string[];
  /** `over` flags money past the plan (CO-07): committed above the allocation, or paid above the quotes. */
  lines: { category: string; amount: string | null; committed: string | null; paid: string | null; over: string | null }[];
  money: (Record<keyof Pick<MoneySummary, "committed" | "paid" | "remaining">, string> & { overpaid: string | null }) | null;
  progress: { done: number; total: number; percent: number };
  next: string[];
  vendors: { category: string; status: VendorStatus; statusLabel: string; amounts: string | null; note: string | null }[];
  notNeeded: number;
  ideas: string[];
}

export function toSharedView(plan: EventDoc, view: PlanView, options: ShareOptions): SharedView {
  const { details } = plan;
  const amount = (n: number) => (options.showAmounts ? formatInr(n) : null);
  const people = details.eventType === "community" ? "residents" : "guests";
  const active = view.vendors.filter((vendor) => vendor.status !== "not_needed");
  return {
    heading: options.showTitle && details.title ? details.title : `${defaultEventTitle(details)} · ${details.city}`,
    meta: `${formatWeekdayDate(details.eventDate)} · ${details.city} · ${formatCount(plan.guests.total)} ${people}`,
    budgetTotal: amount(plan.budget.total),
    functions: plan.functions.map((fn) => `${fn.name} ${functionWhen(fn)}`),
    lines: plan.budget.lines.map((line) => {
      const money = view.moneyByLine.get(line.id);
      const committed = money?.committed ?? 0;
      const overpaid = overpaidOf(plan.vendors.filter((vendor) => vendor.budgetLineId === line.id));
      const flags = [
        committed > line.amount ? `Over by ${formatInr(committed - line.amount)}` : null,
        overpaid > 0 ? `${formatInr(overpaid)} paid above the quote` : null,
      ].filter(Boolean);
      const over = options.showAmounts && flags.length > 0 ? flags.join(" · ") : null;
      return { category: line.category, amount: amount(line.amount), committed: amount(committed), paid: amount(money?.paid ?? 0), over };
    }),
    money: options.showAmounts
      ? {
          committed: formatInr(view.money.committed),
          paid: formatInr(view.money.paid),
          remaining: view.money.remaining < 0 ? `Over by ${formatInr(-view.money.remaining)}` : formatInr(view.money.remaining),
          overpaid: overpaidOf(plan.vendors) > 0 ? formatInr(overpaidOf(plan.vendors)) : null,
        }
      : null,
    progress: view.progress,
    next: view.tasks
      .filter((task) => !task.done)
      .slice(0, 3)
      .map((task) => `${task.title} (${formatShortDate(task.dueDate)}${task.rushed ? ", rushed" : ""})`),
    vendors: active.map((vendor) => ({
      category: vendor.category,
      status: vendor.status,
      statusLabel: VENDOR_STATUS_LABELS[vendor.status],
      amounts:
        options.showAmounts && vendor.quotedAmount !== null
          ? `Quoted ${formatInr(vendor.quotedAmount)}${vendor.paidAmount > 0 ? ` · Paid ${formatInr(vendor.paidAmount)}` : ""}`
          : null,
      note: options.showNotes && vendor.notes ? vendor.notes : null,
    })),
    notNeeded: view.vendors.length - active.length,
    ideas: plan.ideas.filter((idea) => idea.state === "saved").map((idea) => idea.title),
  };
}

/** Share tokens are 256-bit base64url strings (spec 3.1); anything else is a 404 without a lookup. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const isShareToken = (token: string) => SHARE_TOKEN.test(token);
