import { assertPlanInvariants } from "@/lib/domain/invariants";
import { REVIEW_SECTIONS, type ReviewSection } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Decision, Proposal } from "@/lib/domain/model/records";
import { applyOperations } from "@/lib/domain/ops/apply";
import { decideProposal } from "@/lib/domain/ops/decide";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import type { ApplyResult, DecideResult, PlanStore, ReviewControls } from "./PlanStore";

/**
 * The signed-in workspace's plan kept in memory, for tests and component work without a server
 * (the app uses `ServerPlanStore`). It applies the same pure ops the server will, bumps `version` on
 * every change like the server, and keeps an undo stack of whole plans.
 */
export class LocalPlanStore implements PlanStore, ReviewControls {
  readonly mode = "server";
  private plan: EventDoc;
  private undoStack: EventDoc[] = [];
  private readonly createdVersion: number;
  private readonly listeners = new Set<() => void>();

  constructor(
    plan: EventDoc,
    private readonly today: string,
  ) {
    this.plan = structuredClone(plan);
    this.createdVersion = plan.version;
  }

  getPlan(): EventDoc {
    return this.plan;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Manual edits apply all or nothing, as one PATCH would. */
  async applyManual(ops: PlanOperation[]): Promise<ApplyResult> {
    const outcome = applyOperations(this.plan, ops, { today: this.today, actor: "user" });
    const failed = outcome.results.find((result) => !result.ok);
    if (failed) return { ok: false, plan: this.plan, results: outcome.results, reason: failed.reason };
    this.commit(outcome.plan);
    return { ok: true, plan: this.plan, results: outcome.results };
  }

  async decide(proposal: Proposal, decisions: Decision[]): Promise<DecideResult> {
    const outcome = decideProposal(this.plan, proposal, decisions, { today: this.today });
    if (outcome.applied.length > 0) this.commit(outcome.plan);
    else this.replace(outcome.plan);
    return { plan: this.plan, proposal: outcome.proposal, results: outcome.results };
  }

  undoDepth(): number {
    return this.undoStack.length;
  }

  async undo(): Promise<ApplyResult> {
    const previous = this.undoStack.pop();
    if (!previous) return { ok: false, plan: this.plan, results: [], reason: "Nothing to undo" };
    this.replace({ ...previous, version: this.plan.version + 1 });
    return { ok: true, plan: this.plan, results: [] };
  }

  /** "Looks good" and accepted resets: no plan change and no version bump (spec 12.1 PUT /review). */
  async markReviewed(section: ReviewSection, state: "reviewed" | "reset"): Promise<void> {
    if (!this.plan.review) return;
    this.replace({ ...this.plan, review: { ...this.plan.review, [section]: state } });
  }

  /** Undo of the creation entry is possible only while nothing has changed since (spec 6.2). */
  canStartFromTemplate(): boolean {
    return this.plan.version === this.createdVersion;
  }

  /** Every section back to the starter template, as one change the user can undo. */
  async startFromTemplate(): Promise<ApplyResult> {
    const ops = REVIEW_SECTIONS.map((section): PlanOperation => ({ type: "reset_section", section }));
    const outcome = applyOperations(this.plan, ops, { today: this.today, actor: "ai", proposalOrigin: "code" });
    const review = { budget: "reset", timeline: "reset", vendors: "reset", ideas: "reset" } as const;
    this.commit({ ...outcome.plan, review });
    return { ok: true, plan: this.plan, results: outcome.results };
  }

  private commit(plan: EventDoc): void {
    this.undoStack.push(this.plan);
    this.replace({ ...plan, version: this.plan.version + 1 });
  }

  private replace(plan: EventDoc): void {
    assertPlanInvariants(plan);
    this.plan = plan;
    for (const listener of this.listeners) listener();
  }
}
