import { describeOperation, summaryOf, type CardDiff } from "@/lib/domain/describe";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Decision, Proposal, ProposalItem } from "@/lib/domain/model/records";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { ApplyContext } from "@/lib/domain/ops/context";
import type { DecisionResult } from "@/lib/domain/ops/decide";
import type { PlanOperation } from "@/lib/domain/ops/schema";

/**
 * Proposal batches on the client (spec 6.1): building a proposal from ops with per-item dry runs,
 * and the live re-check every card runs against the plan it is shown on, so a card's diff and
 * validity always match the plan the user sees ("No longer applies" otherwise, spec 5.10).
 */

const DAY_MS = 86_400_000;
/** Proposals expire after 24 hours (spec 6.1). */
export const PROPOSAL_TTL_MS = DAY_MS;

export interface ProposalDraftItem {
  /** Defaults to `item-N`; a re-stored client proposal keeps its own ids. */
  id?: string;
  op: PlanOperation;
  rationale?: string;
  /** Ids of earlier items (`item-1` ...) that must be applied first. */
  dependsOn?: string[];
  /** Known invalid before any dry run, e.g. a name that matched nothing ("No budget category called …"). */
  invalidReason?: string;
}

export interface ProposalDraft {
  touchpoint: Proposal["touchpoint"];
  origin: Proposal["origin"];
  instruction: string;
  items: ProposalDraftItem[];
  reply?: string | null;
  fallback?: boolean;
  model?: string;
  /** The output filter removed something from the model's text. */
  filtered?: boolean;
  latencyMs?: number;
}

export interface ItemPreview {
  ok: boolean;
  reason?: string;
  diff: CardDiff;
  /** Titles of pending items this one also applies ("Also adds Sangeet function"). */
  alsoAdds: string[];
}

const contextOf = (proposal: Pick<Proposal, "origin">, today: string): ApplyContext => ({
  today,
  actor: "ai",
  proposalOrigin: proposal.origin,
});

function pendingDependencies(items: ProposalItem[], item: ProposalItem, seen = new Set<string>()): ProposalItem[] {
  return item.dependsOn.flatMap((id) => {
    const dep = items.find((i) => i.id === id);
    if (!dep || dep.status !== "pending" || seen.has(id)) return [];
    seen.add(id);
    return [...pendingDependencies(items, dep, seen), dep];
  });
}

/** Dry-runs one item (with its pending dependencies first) against `plan`; `op` overrides the item's op for Edit previews. */
export function previewItem(
  plan: EventDoc,
  proposal: Proposal,
  item: ProposalItem,
  today: string,
  op: PlanOperation = item.op,
): ItemPreview {
  const ctx = contextOf(proposal, today);
  const deps = pendingDependencies(proposal.items, item);
  const depRun = applyOperations(
    plan,
    deps.map((d) => d.op),
    ctx,
  );
  const failed = depRun.results.findIndex((r) => !r.ok);
  const alsoAdds = deps.map((d) => describeOperation(plan, null, d.op, today).title);
  if (failed >= 0) {
    return {
      ok: false,
      reason: `Depends on a suggestion that no longer applies: ${deps[failed].summary}`,
      diff: describeOperation(plan, null, op, today),
      alsoAdds,
    };
  }
  const run = applyOperations(depRun.plan, [op], ctx);
  const [result] = run.results;
  if (!result.ok) return { ok: false, reason: result.reason, diff: describeOperation(depRun.plan, null, op, today), alsoAdds };
  return { ok: true, diff: describeOperation(depRun.plan, run.plan, op, today), alsoAdds };
}

/** A proposal with every item dry-run against `plan`: `pending` when it applies, `invalid` with its reason otherwise. */
export function buildProposal(plan: EventDoc, draft: ProposalDraft, clock: { today: string; now: string }): Proposal {
  const proposal: Proposal = {
    touchpoint: draft.touchpoint,
    origin: draft.origin,
    instruction: draft.instruction,
    baseVersion: plan.version,
    items: draft.items.map((item, i) => ({
      id: item.id ?? `item-${i + 1}`,
      op: item.op,
      summary: "",
      dependsOn: item.dependsOn ?? [],
      status: "pending",
      rationale: (item.rationale ?? "").slice(0, 160),
    })),
    reply: draft.reply ?? null,
    model: draft.model ?? "recorded",
    latencyMs: draft.latencyMs ?? 0,
    fallback: draft.fallback ?? false,
    ...(draft.filtered ? { filtered: true } : {}),
    createdAt: clock.now,
    expireAt: new Date(Date.parse(clock.now) + PROPOSAL_TTL_MS).toISOString(),
  };
  proposal.items.forEach((item, i) => {
    const preview = previewItem(plan, proposal, item, clock.today);
    item.summary = summaryOf(preview.diff);
    const reason = draft.items[i].invalidReason ?? (preview.ok ? undefined : preview.reason);
    if (reason) Object.assign(item, { status: "invalid", reason });
  });
  return proposal;
}

/** Accept decisions for every pending item that still applies, in listed order ("Accept all valid"). */
export function acceptAllDecisions(plan: EventDoc, proposal: Proposal, today: string): Decision[] {
  return proposal.items
    .filter((item) => item.status === "pending" && previewItem(plan, proposal, item, today).ok)
    .map((item) => ({ itemId: item.id, action: "accept" }));
}

export function validPendingCount(plan: EventDoc, proposal: Proposal, today: string): number {
  return acceptAllDecisions(plan, proposal, today).length;
}

/** "2 applied, 1 skipped: There is no budget category called 'Stage decor'." (spec 6.1 Accept all). */
export function acceptAllSummary(results: DecisionResult[], skipped: string[]): string {
  const applied = results.filter((r) => r.ok).length;
  const reasons = [...skipped, ...results.flatMap((r) => (r.ok || !r.reason ? [] : [r.reason]))];
  return reasons.length > 0 ? `${applied} applied, ${reasons.length} skipped: ${reasons.join(" ")}` : `${applied} applied`;
}

/** Why each item Accept all leaves out (not valid, or no longer applying to `plan`). */
export function skippedReasons(plan: EventDoc, proposal: Proposal, today: string): string[] {
  return proposal.items.flatMap((item) => {
    if (item.status === "invalid") return [item.reason ?? "Not valid."];
    if (item.status !== "pending") return [];
    const preview = previewItem(plan, proposal, item, today);
    return preview.ok ? [] : [preview.reason ?? "No longer applies."];
  });
}

/** The batch heading: "3 suggestions for 'cut decor spend by 20%'", or "Reply to ..." for an answer with no cards. */
export function batchHeading(proposal: Proposal): string {
  const n = proposal.items.length;
  if (n === 0) return proposal.instruction ? `Reply to "${proposal.instruction}"` : "Reply";
  // What-if trade-offs say where they came from, also when restored in AI mode later (MQR-04).
  if (proposal.touchpoint === "whatif")
    return `${n} trade-off${n === 1 ? "" : "s"} from What-if${proposal.instruction ? `: ${proposal.instruction}` : ""}`;
  const noun = n === 1 ? "suggestion" : "suggestions";
  return proposal.instruction ? `${n} ${noun} for "${proposal.instruction}"` : `${n} ${noun}`;
}

export const isApplied = (item: ProposalItem) => item.status === "accepted" || item.status === "edited";
