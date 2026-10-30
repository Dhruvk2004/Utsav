import { formatInr } from "@/lib/domain/budget";
import { moneyDelta, type CardDiff } from "@/lib/domain/describe";
import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanOperation } from "@/lib/domain/ops/schema";

/**
 * Follow-up cards (design-system 6.5): when a new budget change replaces an earlier AI change to
 * the same category ("make that 15% instead", by the server's rule in `replaceEarlier.ts`), the
 * card says "Replaces your earlier change" and its title and rows describe the net effect from
 * the amount before that change.
 */

const percent = (from: number, to: number) => (from === 0 ? 0 : Math.round(((to - from) / from) * 100));
const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n)}%`;

/** The line a budget-adjusting op targets, or null for other ops. */
export function adjustedLine(op: PlanOperation): string | null {
  return op.type === "adjust_budget_category" ? op.lineId : null;
}

/**
 * The follow-up diff for `op`, given the line's amount before the earlier change (`original`).
 * `after` is the plan after a dry run of `op`; null when it does not apply.
 */
export function followUpDiff(before: EventDoc, after: EventDoc | null, op: PlanOperation, original: number): CardDiff | null {
  const lineId = adjustedLine(op);
  const line = lineId ? before.budget.lines.find((l) => l.id === lineId) : undefined;
  const next = lineId ? after?.budget.lines.find((l) => l.id === lineId) : undefined;
  if (!line || !next) return null;
  const [was, now] = [percent(original, line.amount), percent(original, next.amount)];
  const title =
    was < 0 && now < 0
      ? `Change ${line.category} cut from ${-was}% to ${-now}%`
      : `Change ${line.category} from ${signed(was)} to ${signed(now)} of the original`;
  return {
    title,
    rows: [
      {
        label: "From original",
        before: formatInr(original),
        after: formatInr(next.amount),
        delta: { text: signed(now), tone: now < 0 ? "less" : "more", label: `${Math.abs(now)}% ${now < 0 ? "less" : "more"}` },
      },
      { label: "From now", before: formatInr(line.amount), after: formatInr(next.amount), delta: moneyDelta(line.amount, next.amount) },
    ],
    notes: [],
  };
}
