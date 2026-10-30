import type { EventDoc } from "@/lib/domain/model/event";
import type { HistoryDoc } from "@/lib/domain/model/records";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { OpOf, PlanOperation } from "@/lib/domain/ops/schema";
import type { ProposalDraft } from "./proposals";

/**
 * "Make that 15% instead" (spec 6.3, 12.4 follow-up row, MQW-06, MQR-02): a follow-up that replaces
 * an earlier budget change is measured from the amount before that change, never stacked on top of
 * it. The model is asked to do this, and code makes sure: when the instruction says it replaces
 * something and a relative change targets a line an earlier AI change moved, the change becomes a
 * `set_amount` from the line's amount before the earlier change.
 *
 * The earlier change is a `LineStep` with the amounts the plan really had before and after it
 * (from the history entry, or from replaying the demo's ops), never derived from the op. It only
 * counts while the line still holds its "after" amount: once it is undone, edited by hand or moved
 * by another change, a follow-up applies to the amount the line has now.
 */

/** "instead" (not "instead of", which names something else) and "make it/that …"; never "rather". */
const REPLACES = /\b(instead\b(?!\s+of\b)|make (?:it|that)\b|change (?:it|that) to\b)/i;

export function replacesEarlier(instruction: string): boolean {
  return REPLACES.test(instruction);
}

/** One earlier change to a budget line, in the order it was applied. */
export interface LineStep {
  lineId: string;
  /** The line's amount just before and just after the change. */
  before: number;
  after: number;
  /** The change itself came from an "instead" follow-up, so it replaced the change before it. */
  replaces: boolean;
}

type Adjust = OpOf<"adjust_budget_category">;

/** The amount an adjust op lands the line on from `current` (as `adjustBudgetCategory` computes it). */
function adjusted(op: Adjust, current: number): number {
  if (op.mode === "percent_change") return Math.round(current * (1 + op.value / 100));
  return op.mode === "set_amount" ? op.value : current + op.value;
}

/** A relative `op` applied to `original` instead of the current amount; null for an absolute amount. */
function fromOriginal(op: Adjust, original: number): number | null {
  return op.mode === "set_amount" ? null : adjusted(op, original);
}

/**
 * Per line, the change a follow-up replaces. A change that itself replaced the one right before it
 * keeps that one's "before", so a second "instead" is measured from the same original amount.
 */
export function latestChanges(steps: readonly LineStep[]): Map<string, { before: number; after: number }> {
  const latest = new Map<string, { before: number; after: number }>();
  for (const step of steps) {
    const previous = latest.get(step.lineId);
    const before = step.replaces && previous && previous.after === step.before ? previous.before : step.before;
    latest.set(step.lineId, { before, after: step.after });
  }
  return latest;
}

/** Rewrites relative budget changes in `draft` that replace an earlier one (`steps`, oldest first). */
export function replaceEarlierChanges(draft: ProposalDraft, plan: EventDoc, steps: readonly LineStep[]): ProposalDraft {
  if (!replacesEarlier(draft.instruction)) return draft;
  const latest = latestChanges(steps);
  if (latest.size === 0) return draft;
  const items = draft.items.map((item) => {
    const { op } = item;
    if (op.type !== "adjust_budget_category") return item;
    const prior = latest.get(op.lineId);
    const line = plan.budget.lines.find((l) => l.id === op.lineId);
    // Undone, edited by hand or moved since: the earlier change is no longer what the line shows.
    if (!prior || !line || line.amount !== prior.after) return item;
    const target = fromOriginal(op, prior.before);
    if (target === null || target < 0) return item;
    return { ...item, op: { ...op, mode: "set_amount" as const, value: target } };
  });
  return { ...draft, items };
}

const isUndo = (entry: HistoryDoc) => entry.ops.length === 0 && entry.label.startsWith("Undo: ");

/**
 * Line steps from an event's history entries (any order): only AI changes (`user_via_ai`) that are
 * still in effect. An undo entry starts at the version its target ended at (undo needs the plan
 * unchanged since), so it marks that entry undone, unless the undo was itself undone. The amount
 * before comes from the entry's `before` snapshot; an adjust op always lands the line on its exact
 * new amount, whatever the rebalance. `replacing` holds the ids of proposals whose instruction replaced an earlier change.
 */
export function stepsFromHistory(entries: readonly HistoryDoc[], replacing: ReadonlySet<string>): LineStep[] {
  const newestFirst = [...entries].sort((a, b) => b.versionAfter - a.versionAfter);
  const undone = new Set<number>();
  for (const entry of newestFirst) if (isUndo(entry) && !undone.has(entry.versionAfter)) undone.add(entry.versionBefore);
  const steps: LineStep[] = [];
  for (const entry of newestFirst.reverse()) {
    if (entry.actor !== "user_via_ai" || undone.has(entry.versionAfter) || !entry.before.budget) continue;
    const amounts = new Map(entry.before.budget.lines.map((line) => [line.id, line.amount]));
    for (const op of entry.ops) {
      if (op.type !== "adjust_budget_category") continue;
      const before = amounts.get(op.lineId);
      if (before === undefined) continue;
      const after = adjusted(op, before);
      amounts.set(op.lineId, after);
      steps.push({ lineId: op.lineId, before, after, replaces: entry.proposalId !== undefined && replacing.has(entry.proposalId) });
    }
  }
  return steps;
}

/**
 * Line steps from the demo's accepted ops, replayed one at a time onto `start` (its pristine
 * sample). `replacing` holds the indexes of ops decided on an "instead" answer, so a second
 * "instead" is measured from the same original amount, as in `stepsFromHistory` (MQR-02 d).
 */
export function stepsFromOps(
  start: EventDoc,
  ops: readonly PlanOperation[],
  today: string,
  replacing: ReadonlySet<number> = new Set(),
): LineStep[] {
  const steps: LineStep[] = [];
  let plan = start;
  for (const [index, op] of ops.entries()) {
    const run = applyOperations(plan, [op], { today, actor: "user" });
    if (op.type === "adjust_budget_category") {
      const amount = (doc: EventDoc) => doc.budget.lines.find((line) => line.id === op.lineId)?.amount;
      const before = amount(plan);
      const after = amount(run.plan);
      if (before !== undefined && after !== undefined) steps.push({ lineId: op.lineId, before, after, replaces: replacing.has(index) });
    }
    plan = run.plan;
  }
  return steps;
}
