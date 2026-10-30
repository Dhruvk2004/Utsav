import type { ReviewSection } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Decision, ItemStatus, Proposal } from "@/lib/domain/model/records";
import type { OpResult } from "@/lib/domain/ops/apply";
import type { DecisionResult } from "@/lib/domain/ops/decide";
import type { PlanOperation } from "@/lib/domain/ops/schema";

/**
 * The plan state every workspace component reads and writes through (spec 5.10). The
 * workspace uses a server-backed store; the public demo uses `SandboxPlanStore`, so the same
 * editors, cards and Edit forms work unchanged in both.
 */
export interface PlanStore {
  /** Current state rendered by every component. */
  getPlan(): EventDoc;
  /** For `useSyncExternalStore`; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Tab editors. */
  applyManual(ops: PlanOperation[]): Promise<ApplyResult>;
  /** Suggestion cards: accept / edit / decline / restore. */
  decide(proposal: Proposal, decisions: Decision[]): Promise<DecideResult>;
  /** Reverts the latest applied batch. */
  undo(): Promise<ApplyResult>;
  /**
   * How many of this tab's changes Undo can still revert, newest last. It shrinks without an undo
   * when the store drops entries (a version conflict, a refused undo), so the workspace can keep
   * its own Undo buttons in step.
   */
  undoDepth(): number;
  readonly mode: "server" | "sandbox";
}

export interface ApplyResult {
  ok: boolean;
  plan: EventDoc;
  results: OpResult[];
  reason?: string;
}

export interface DecideResult {
  plan: EventDoc;
  proposal: Proposal;
  results: DecisionResult[];
  /** Set when the request itself failed (offline, a network or server error, a conflict), so nothing was decided. */
  reason?: string;
}

/** One AI-mode request and what became of its cards, sent back as plan-chat context (spec 6.3). */
export interface PreviousTurn {
  instruction: string;
  items: { summary: string; status: ItemStatus }[];
}

/**
 * The "Review your new plan" banner's controls (spec 6.2), offered by the signed-in workspace only:
 * "Looks good" (`PUT /review`, no plan change) and "Start from the starter template instead".
 */
export interface ReviewControls {
  markReviewed(section: ReviewSection, state: "reviewed" | "reset"): Promise<void>;
  canStartFromTemplate(): boolean;
  startFromTemplate(): Promise<ApplyResult>;
}
