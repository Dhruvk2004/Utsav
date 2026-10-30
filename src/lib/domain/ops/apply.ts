import { allocate, percentOf } from "../budget";
import type { EventDoc } from "../model/event";
import { computeStats } from "../stats";
import { deriveView } from "../view";
import * as budget from "./budgetOps";
import { fail, OpError, type ApplyContext } from "./context";
import * as event from "./eventOps";
import * as fns from "./functionOps";
import * as ideas from "./ideaOps";
import { resetSection } from "./resetOps";
import { isProposable, type OpOf, type OpType, type PlanOperation } from "./schema";
import * as tasks from "./taskOps";
import * as vendors from "./vendorOps";

export type OpResult = { ok: true } | { ok: false; reason: string };
export interface ApplyOutcome {
  plan: EventDoc;
  results: OpResult[];
}

type Handler<T extends OpType> = (plan: EventDoc, op: OpOf<T>, ctx: ApplyContext) => void;

const HANDLERS: { [T in OpType]: Handler<T> } = {
  set_total_budget: budget.setTotalBudget,
  set_budget_lines: budget.setBudgetLines,
  adjust_budget_category: budget.adjustBudgetCategory,
  add_budget_category: budget.addBudgetCategory,
  rename_budget_category: budget.renameBudgetCategory,
  remove_budget_category: budget.removeBudgetCategory,
  set_budget_note: budget.setBudgetNote,
  add_function: fns.addFunction,
  move_function: fns.moveFunction,
  set_function_share: fns.setFunctionShare,
  rename_function: fns.renameFunction,
  remove_function: fns.removeFunction,
  add_task: tasks.addTask,
  update_task: tasks.updateTask,
  remove_task: tasks.removeTask,
  add_vendor: vendors.addVendor,
  update_vendor: vendors.updateVendor,
  set_vendor_status: vendors.setVendorStatus,
  remove_vendor: vendors.removeVendor,
  save_draft: vendors.saveDraft,
  remove_draft: vendors.removeDraft,
  add_idea: ideas.addIdea,
  update_idea: ideas.updateIdea,
  save_idea: ideas.saveIdea,
  remove_idea: ideas.removeIdea,
  clear_dismissed_ideas: ideas.clearDismissedIdeas,
  set_guests: event.setGuests,
  set_personalisation: event.setPersonalisation,
  set_details: event.setDetails,
  set_summary: event.setSummary,
  reset_section: resetSection,
};

/**
 * Re-derives everything that follows from the stored facts: line percents, function
 * amounts from shares (invariant 3), guest flags from counts (invariant 12), stats and warnings.
 */
export function finalizePlan(plan: EventDoc, today: string): EventDoc {
  const { total, lines } = plan.budget;
  for (const line of lines) line.percent = percentOf(line.amount, total);
  const amounts = allocate(
    total,
    plan.functions.map((fn) => fn.sharePercent),
  );
  plan.functions.forEach((fn, i) => (fn.amount = amounts[i]));
  event.syncGuestFlags(plan);
  plan.stats = { ...computeStats(plan), pending: plan.stats.pending };
  plan.warnings = deriveView(plan, today).warnings;
  return plan;
}

function applyOne(plan: EventDoc, op: PlanOperation, ctx: ApplyContext): void {
  // Actor restrictions (spec 12.2): proposals may only carry the 6.1 Edit-forms op types.
  if (ctx.actor === "ai" && !isProposable(op)) fail("This change can only be made by you");
  (HANDLERS[op.type] as Handler<OpType>)(plan, op, ctx);
}

/**
 * Applies ops in order on a copy of the plan. An op a domain rule rejects is skipped and
 * reported with its reason; later ops still run against the state so far. Never throws for
 * domain errors, so callers decide whether a partial batch is acceptable.
 */
export function applyOperations(plan: EventDoc, ops: PlanOperation[], ctx: ApplyContext): ApplyOutcome {
  let current = structuredClone(plan);
  const results: OpResult[] = [];
  for (const op of ops) {
    const next = structuredClone(current);
    try {
      applyOne(next, op, ctx);
      current = finalizePlan(next, ctx.today);
      results.push({ ok: true });
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
      results.push({ ok: false, reason: error.message });
    }
  }
  return { plan: current, results };
}

/** Dry-runs a single op against the plan. */
export function validateOperation(plan: EventDoc, op: PlanOperation, ctx: ApplyContext): OpResult {
  return applyOperations(plan, [op], ctx).results[0];
}
