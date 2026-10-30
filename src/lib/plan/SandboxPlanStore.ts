import { assertPlanInvariants } from "@/lib/domain/invariants";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Decision, Proposal } from "@/lib/domain/model/records";
import { applyOperations } from "@/lib/domain/ops/apply";
import { decideProposal } from "@/lib/domain/ops/decide";
import { isProposable, type PlanOperation } from "@/lib/domain/ops/schema";
import type { ApplyResult, DecideResult, PlanStore, PreviousTurn } from "./PlanStore";
import { replacesEarlier } from "./replaceEarlier";

/** Server-side replay limits for the public demo (spec 5.10). */
export const SANDBOX_MAX_OPS = 20;
export const SANDBOX_MAX_TURNS = 4;

const LIMIT_REASON = `The sample keeps up to ${SANDBOX_MAX_OPS} changes. Reset it to try more.`;

/**
 * An in-memory plan for the public demo. It applies the same pure ops as the server, keeps
 * the accepted ops (`appliedOps`) so the server can replay them onto the pristine fixture,
 * and keeps an undo stack. Reloading the page starts again from the fixture.
 */
export class SandboxPlanStore implements PlanStore {
  readonly mode = "sandbox";
  private plan: EventDoc;
  private ops: PlanOperation[] = [];
  /** Per op in `ops`: whether it came from a proposal whose instruction replaces an earlier change. */
  private replacing: boolean[] = [];
  private turns: PreviousTurn[] = [];
  private undoStack: { plan: EventDoc; opCount: number }[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly pristine: EventDoc,
    private readonly today: string,
  ) {
    this.plan = structuredClone(pristine);
  }

  getPlan(): EventDoc {
    return this.plan;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Ops accepted in this sandbox, in order, as the demo AI routes expect them. */
  get appliedOps(): readonly PlanOperation[] {
    return this.ops;
  }

  /**
   * Indexes into `appliedOps` of ops decided on an "instead" proposal, so the server measures a
   * second "instead" from the same original amount, as it does for signed-in users (MQR-02 d).
   */
  get replacingOps(): number[] {
    return this.replacing.flatMap((replaces, index) => (replaces ? [index] : []));
  }

  get previousTurns(): readonly PreviousTurn[] {
    return this.turns;
  }

  recordTurn(turn: PreviousTurn): void {
    this.turns = [...this.turns, turn].slice(-SANDBOX_MAX_TURNS);
  }

  /** Manual edits stay within what the server can replay: proposable ops only, applied all or nothing. */
  async applyManual(ops: PlanOperation[]): Promise<ApplyResult> {
    if (!ops.every(isProposable)) return this.rejected("Sample plans change only through suggestions");
    if (this.ops.length + ops.length > SANDBOX_MAX_OPS) return this.rejected(LIMIT_REASON);
    const outcome = applyOperations(this.plan, ops, { today: this.today, actor: "user" });
    const failed = outcome.results.find((result) => !result.ok);
    if (failed) return { ok: false, plan: this.plan, results: outcome.results, reason: failed.reason };
    this.commit(outcome.plan, ops, false);
    return { ok: true, plan: this.plan, results: outcome.results };
  }

  async decide(proposal: Proposal, decisions: Decision[]): Promise<DecideResult> {
    const outcome = decideProposal(this.plan, proposal, decisions, { today: this.today });
    if (this.ops.length + outcome.applied.length > SANDBOX_MAX_OPS) {
      const results = decisions.map((d) => ({ itemId: d.itemId, ok: false, reason: LIMIT_REASON }));
      return { plan: this.plan, proposal, results };
    }
    if (outcome.applied.length > 0) this.commit(outcome.plan, outcome.applied, replacesEarlier(proposal.instruction));
    else this.replace(outcome.plan);
    return { plan: this.plan, proposal: outcome.proposal, results: outcome.results };
  }

  undoDepth(): number {
    return this.undoStack.length;
  }

  async undo(): Promise<ApplyResult> {
    const entry = this.undoStack.pop();
    if (!entry) return this.rejected("Nothing to undo");
    this.ops = this.ops.slice(0, entry.opCount);
    this.replacing = this.replacing.slice(0, entry.opCount);
    this.replace(entry.plan);
    return { ok: true, plan: this.plan, results: [] };
  }

  /** Back to the pristine sample. */
  reset(): void {
    this.ops = [];
    this.replacing = [];
    this.turns = [];
    this.undoStack = [];
    this.replace(structuredClone(this.pristine));
  }

  private commit(plan: EventDoc, ops: PlanOperation[], replaces: boolean): void {
    this.undoStack.push({ plan: this.plan, opCount: this.ops.length });
    this.ops = [...this.ops, ...ops];
    this.replacing = [...this.replacing, ...ops.map(() => replaces)];
    this.replace(plan);
  }

  private replace(plan: EventDoc): void {
    assertPlanInvariants(plan);
    this.plan = plan;
    for (const listener of this.listeners) listener();
  }

  private rejected(reason: string): ApplyResult {
    return { ok: false, plan: this.plan, results: [], reason };
  }
}
