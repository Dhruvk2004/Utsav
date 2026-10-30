import { ApiRequestError } from "@/lib/data/api";
import { conflictEvent, rejectedResults, type PlanApi, type ProposalRequest } from "@/lib/data/planApi";
import type { ReviewSection } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Decision, Proposal } from "@/lib/domain/model/records";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { CREATED_VERSION, CREATION_HISTORY_ID } from "./commands";
import type { ApplyResult, DecideResult, PlanStore, ReviewControls } from "./PlanStore";

/**
 * The signed-in workspace's plan (spec 5.10, 12.1): every change goes to the server with the
 * version this tab last saw. On a 409 the store swaps in the latest plan the server returned and
 * reports "This plan changed in another tab" (spec 3.4); cards then re-check against it. Undo
 * reverts this tab's own changes, newest first, through their history entries.
 *
 * Requests run one at a time, in the order they were made (QA-19): each one starts only after the
 * previous answer is in, so it carries the version that answer brought. Two quick decisions or
 * edits in one tab then never race each other into a false "changed in another tab" conflict.
 */
export class ServerPlanStore implements PlanStore, ReviewControls {
  readonly mode = "server";
  private plan: EventDoc;
  private undoStack: string[] = [];
  private readonly listeners = new Set<() => void>();
  /** The last queued request; the next one starts when it settles, whatever its outcome. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Ids given to proposals built in the browser, so a second decision on the same one never stores it twice. */
  private readonly stored = new WeakMap<Proposal, string>();

  constructor(
    plan: EventDoc,
    private readonly api: PlanApi,
  ) {
    this.plan = plan;
  }

  getPlan(): EventDoc {
    return this.plan;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  applyManual(ops: PlanOperation[]): Promise<ApplyResult> {
    return this.serial(() => this.patch(ops));
  }

  decide(proposal: Proposal, decisions: Decision[]): Promise<DecideResult> {
    return this.serial(() => this.decideNow(proposal, decisions));
  }

  private async patch(ops: PlanOperation[]): Promise<ApplyResult> {
    try {
      const { event, historyId } = await this.api.patch(this.plan.version, ops);
      this.undoStack.push(historyId);
      this.replace(event);
      return { ok: true, plan: this.plan, results: ops.map(() => ({ ok: true })) };
    } catch (error) {
      return this.failed(error);
    }
  }

  private async decideNow(proposal: Proposal, decisions: Decision[]): Promise<DecideResult> {
    try {
      const id = proposal.id ?? this.stored.get(proposal) ?? (await this.storeProposal(proposal));
      const result = await this.api.decide(id, this.plan.version, decisions);
      if (result.historyId) this.undoStack.push(result.historyId);
      this.replace(result.event);
      return { plan: this.plan, proposal: result.proposal, results: result.results };
    } catch (error) {
      const failed = this.failed(error);
      return {
        plan: failed.plan,
        proposal,
        results: decisions.map((d) => ({ itemId: d.itemId, ok: false, reason: failed.reason })),
        reason: failed.reason,
      };
    }
  }

  private async storeProposal(proposal: Proposal): Promise<string> {
    const { id } = await this.api.createProposal(storable(proposal, this.plan.version));
    this.stored.set(proposal, id);
    return id;
  }

  undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * The entry leaves the stack only once the server has answered: a network or server failure
   * keeps it, so Undo can be tried again (QA-17); a refusal (the plan changed since) drops it.
   */
  undo(): Promise<ApplyResult> {
    return this.serial(() => this.undoNow());
  }

  private async undoNow(): Promise<ApplyResult> {
    const historyId = this.undoStack.at(-1);
    if (!historyId) return { ok: false, plan: this.plan, results: [], reason: "Nothing to undo" };
    const result = await this.restore(historyId, (error) => !retryable(error));
    if (result.ok) this.drop(historyId);
    return result;
  }

  markReviewed(section: ReviewSection, state: "reviewed" | "reset"): Promise<void> {
    return this.serial(async () => {
      if (!this.plan.review) return;
      await this.api.review(section, state);
      this.replace({ ...this.plan, review: { ...this.plan.review, [section]: state } });
    });
  }

  /** Only an AI plan nobody has changed yet can go back to the starter template (spec 6.2). */
  canStartFromTemplate(): boolean {
    return this.plan.review !== null && this.plan.version === CREATED_VERSION;
  }

  /** The restore is itself a change, so its own history entry goes on the stack for Undo. */
  startFromTemplate(): Promise<ApplyResult> {
    return this.serial(async () => {
      const result = await this.restore(CREATION_HISTORY_ID);
      if (result.ok && result.historyId) this.undoStack.push(result.historyId);
      return result;
    });
  }

  /** Runs `request` once every earlier one has settled, so it reads the plan they left (QA-19). */
  private serial<T>(request: () => Promise<T>): Promise<T> {
    const run = this.queue.then(request);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async restore(
    historyId: string,
    dropOn: (error: unknown) => boolean = () => false,
  ): Promise<ApplyResult & { historyId?: string }> {
    try {
      const applied = await this.api.undo(historyId);
      this.replace(applied.event);
      return { ok: true, plan: this.plan, results: [], historyId: applied.historyId };
    } catch (error) {
      if (dropOn(error)) this.drop(historyId);
      return this.failed(error);
    }
  }

  private drop(historyId: string): void {
    this.undoStack = this.undoStack.filter((id) => id !== historyId);
  }

  /**
   * A refused or failed request leaves the plan as it was, except a version conflict, which brings
   * in the latest plan (and drops this tab's undo history, which no longer applies).
   */
  private failed(error: unknown): ApplyResult {
    if (!(error instanceof ApiRequestError)) return { ok: false, plan: this.plan, results: [], reason: OFFLINE_MESSAGE };
    const latest = error.status === 409 ? conflictEvent(error.body) : null;
    if (latest) {
      this.undoStack = [];
      this.replace(latest);
    }
    return { ok: false, plan: this.plan, results: rejectedResults(error.body) ?? [], reason: error.message };
  }

  private replace(plan: EventDoc): void {
    this.plan = plan;
    for (const listener of this.listeners) listener();
  }
}

const OFFLINE_MESSAGE = "Couldn't save. Check your connection and try again.";

/** No answer, a server error or rate limiting: the same request may work later. */
function retryable(error: unknown): boolean {
  return !(error instanceof ApiRequestError) || error.status >= 500 || error.status === 429;
}

/**
 * AI proposals arrive stored (with an id). One built in the browser is stored first; the server
 * re-runs every item and labels it "Suggested by Utsav", so nothing skips the server's checks.
 */
function storable(proposal: Proposal, baseVersion: number): ProposalRequest {
  return {
    touchpoint: proposal.touchpoint,
    baseVersion,
    instruction: proposal.instruction,
    items: proposal.items.map(({ id, op, dependsOn, rationale }) => ({ id, op, dependsOn, rationale })),
  };
}
