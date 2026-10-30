import { describeOperation, summaryOf } from "../describe";
import { sameJson } from "../equality";
import type { EventDoc } from "../model/event";
import type { Decision, ItemStatus, Proposal, ProposalItem } from "../model/records";
import { applyOperations, finalizePlan, validateOperation } from "./apply";
import type { ApplyContext } from "./context";
import { EDIT_REJECTED, isFaithfulEdit } from "./editIntegrity";
import { forgetDismissed, rememberDismissed } from "./ideaOps";
import { isProposable, type PlanOperation } from "./schema";

/**
 * Applies the user's decisions on a proposal's items (spec 6.1, 8.2 decision transitions):
 * pending -> accepted | edited | declined; declined -> pending (restore, re-validated).
 * Shared by the server `decide` handler and the sandbox store, so both behave identically.
 */

export interface DecisionResult {
  itemId: string;
  ok: boolean;
  status?: ItemStatus;
  reason?: string;
}

export interface DecideOutcome {
  plan: EventDoc;
  proposal: Proposal;
  results: DecisionResult[];
  /** Ops applied, in order, as one batch (for history and the sandbox's `appliedOps`). */
  applied: PlanOperation[];
}

type DecideContext = Pick<ApplyContext, "today" | "now" | "draftOrigin">;

function ideaTitle(item: ProposalItem): string | null {
  return item.op.type === "add_idea" ? item.op.idea.title : null;
}

/** Pending items this one depends on, deepest first, so accepting B also accepts A. */
function pendingDependencies(items: ProposalItem[], item: ProposalItem, seen = new Set<string>()): ProposalItem[] {
  const deps: ProposalItem[] = [];
  for (const id of item.dependsOn) {
    const dep = items.find((i) => i.id === id);
    if (!dep || dep.status !== "pending" || seen.has(id)) continue;
    seen.add(id);
    deps.push(...pendingDependencies(items, dep, seen), dep);
  }
  return deps;
}

export function decideProposal(plan: EventDoc, proposal: Proposal, decisions: Decision[], ctx: DecideContext): DecideOutcome {
  let current = structuredClone(plan);
  const next = structuredClone(proposal);
  const applied: PlanOperation[] = [];
  const base: ApplyContext = { ...ctx, actor: "ai", proposalOrigin: proposal.origin };

  const accept = (item: ProposalItem, editedOp: PlanOperation | undefined): DecisionResult => {
    if (editedOp && !isFaithfulEdit(item.op, editedOp)) return { itemId: item.id, ok: false, reason: EDIT_REJECTED };
    if (!isProposable(item.op)) return { itemId: item.id, ok: false, reason: "Not editable" };
    const op = editedOp ?? item.op;
    const edited = editedOp !== undefined && !sameJson(editedOp, item.op);
    const deps = pendingDependencies(next.items, item);
    const depRun = applyOperations(
      current,
      deps.map((d) => d.op),
      base,
    );
    const failedDep = depRun.results.findIndex((r) => !r.ok);
    if (failedDep >= 0) {
      const reason = `Depends on a suggestion that no longer applies: ${deps[failedDep].summary}`;
      Object.assign(item, { status: "invalid", reason });
      return { itemId: item.id, ok: false, status: "invalid", reason };
    }
    const run = applyOperations(depRun.plan, [op], { ...base, edited });
    const [result] = run.results;
    if (!result.ok) {
      Object.assign(item, { status: "invalid", reason: result.reason });
      return { itemId: item.id, ok: false, status: "invalid", reason: result.reason };
    }
    // An edited card is described by what was applied, not by the model's original wording (MQW-05).
    const summary = edited ? summaryOf(describeOperation(depRun.plan, run.plan, op, ctx.today)) : item.summary;
    current = run.plan;
    for (const dep of deps) dep.status = "accepted";
    applied.push(...deps.map((d) => d.op), op);
    Object.assign(item, { op, summary, status: edited ? "edited" : "accepted" });
    return { itemId: item.id, ok: true, status: item.status };
  };

  const decline = (item: ProposalItem): DecisionResult => {
    const declined = [item, ...next.items.filter((i) => i.status === "pending" && i.dependsOn.includes(item.id))];
    for (const each of declined) {
      each.status = "declined";
      const title = ideaTitle(each);
      if (title) rememberDismissed(current, title);
    }
    return { itemId: item.id, ok: true, status: "declined" };
  };

  const restore = (item: ProposalItem): DecisionResult => {
    const title = ideaTitle(item);
    if (title) forgetDismissed(current, title);
    const check = validateOperation(current, item.op, base);
    if (check.ok) {
      item.status = "pending";
      delete item.reason;
    } else {
      Object.assign(item, { status: "invalid", reason: check.reason });
    }
    return { itemId: item.id, ok: check.ok, status: item.status, reason: item.reason };
  };

  const results = decisions.map((decision): DecisionResult => {
    const item = next.items.find((i) => i.id === decision.itemId);
    if (!item) return { itemId: decision.itemId, ok: false, reason: "Suggestion not found" };
    if (decision.action === "restore") {
      return item.status === "declined"
        ? restore(item)
        : { itemId: item.id, ok: false, reason: "Only declined suggestions can be restored" };
    }
    if (item.status !== "pending") return { itemId: item.id, ok: false, reason: "This suggestion was already decided" };
    return decision.action === "accept" ? accept(item, decision.editedOp) : decline(item);
  });

  return { plan: finalizePlan(current, ctx.today), proposal: next, results, applied };
}
