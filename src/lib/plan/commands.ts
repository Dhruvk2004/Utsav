import { describeOperation } from "@/lib/domain/describe";
import { sameJson } from "@/lib/domain/equality";
import { assertPlanInvariants } from "@/lib/domain/invariants";
import type { ReviewSection } from "@/lib/domain/model/enums";
import type { EventDoc, PlanStats } from "@/lib/domain/model/event";
import type { Decision, HistoryDoc, Proposal } from "@/lib/domain/model/records";
import { applyOperations, finalizePlan, type OpResult } from "@/lib/domain/ops/apply";
import type { ApplyContext } from "@/lib/domain/ops/context";
import { decideProposal, type DecisionResult } from "@/lib/domain/ops/decide";
import type { PlanOperation } from "@/lib/domain/ops/schema";

/**
 * The server's plan commands as pure functions (spec 8.1, 12.1): each takes the stored event and
 * returns the next event plus the history entry to write, so a route handler is one read, one
 * call and one transactional write. Every result is checked against the plan invariants.
 */

export interface Clock {
  today: string;
  /** ISO timestamp of this request. */
  now: string;
}

const DAY_MS = 86_400_000;
/** History entries expire after 30 days (TTL policy on `expireAt`, spec 8.2). */
export const HISTORY_TTL_MS = 30 * DAY_MS;

/** The creation entry has a fixed id and version, so "Start from the starter template" can name it (spec 6.2). */
export const CREATION_HISTORY_ID = "creation";
export const CREATED_VERSION = 1;

export const CONFLICT_MESSAGE = "This plan changed in another tab. Reloaded the latest version.";
export const UNDO_STALE_MESSAGE = "Undo unavailable: the plan changed after this.";

/** Sections a history entry can snapshot and undo restores; derived fields are recomputed instead. */
export const SNAPSHOT_SECTIONS = [
  "source",
  "details",
  "summary",
  "budget",
  "functions",
  "tasks",
  "vendors",
  "ideas",
  "dismissedIdeaTitles",
  "guests",
  "honorees",
  "flags",
  "review",
] as const satisfies readonly (keyof EventDoc)[];

type Snapshot = Partial<Pick<EventDoc, (typeof SNAPSHOT_SECTIONS)[number]>>;

/** The `before` values of the sections that differ between two plans (`invertSections`, spec 12.2). */
export function changedSections(before: EventDoc, after: EventDoc): Snapshot {
  return Object.fromEntries(SNAPSHOT_SECTIONS.filter((key) => !sameJson(before[key], after[key])).map((key) => [key, before[key]]));
}

/** A code-built label for the history list, from the first op ("Decor cut by 20% and 2 more changes"). */
export function historyLabel(before: EventDoc, ops: PlanOperation[], today: string): string {
  if (ops.length === 0) return "Plan updated";
  const first = describeOperation(before, null, ops[0], today).title;
  const more = ops.length - 1;
  return (more === 0 ? first : `${first} and ${more} more change${more === 1 ? "" : "s"}`).slice(0, 200);
}

export function historyEntry(
  before: EventDoc,
  after: EventDoc,
  entry: Pick<HistoryDoc, "actor" | "label" | "ops" | "proposalId">,
  clock: Clock,
): HistoryDoc {
  return {
    ...entry,
    before: changedSections(before, after),
    versionBefore: before.version,
    versionAfter: after.version,
    createdAt: clock.now,
    expireAt: new Date(Date.parse(clock.now) + HISTORY_TTL_MS).toISOString(),
  };
}

/** The next stored version of a plan: version bumped, timestamps set, invariants asserted. */
export function nextVersion(plan: EventDoc, previous: EventDoc, now: string): EventDoc {
  const next = { ...plan, version: previous.version + 1, updatedAt: now };
  assertPlanInvariants(next);
  return next;
}

export type CommandResult =
  | { ok: true; event: EventDoc; history: HistoryDoc }
  | { ok: false; kind: "conflict"; event: EventDoc }
  | { ok: false; kind: "rejected"; reason: string; results: OpResult[] };

/** PATCH: manual edits, all or nothing, on the version the client last saw. */
export function applyManual(
  event: EventDoc,
  baseVersion: number,
  ops: PlanOperation[],
  clock: Clock,
  draftOrigin?: ApplyContext["draftOrigin"],
): CommandResult {
  if (baseVersion !== event.version) return { ok: false, kind: "conflict", event };
  const outcome = applyOperations(event, ops, { ...clock, actor: "user", draftOrigin });
  const failed = outcome.results.find((result): result is Extract<OpResult, { ok: false }> => !result.ok);
  if (failed) return { ok: false, kind: "rejected", reason: failed.reason, results: outcome.results };
  const next = nextVersion(outcome.plan, event, clock.now);
  return {
    ok: true,
    event: next,
    history: historyEntry(event, next, { actor: "user", label: historyLabel(event, ops, clock.today), ops }, clock),
  };
}

export type UndoResult = { ok: true; event: EventDoc; history: HistoryDoc } | { ok: false; reason: string };

/** Restores a history entry's snapshot, only while nothing has changed since it (spec 6.2). */
export function undoEntry(event: EventDoc, entry: HistoryDoc, clock: Clock): UndoResult {
  if (event.version !== entry.versionAfter) return { ok: false, reason: UNDO_STALE_MESSAGE };
  const restored = finalizePlan({ ...structuredClone(event), ...structuredClone(entry.before as Snapshot) }, clock.today);
  const next = nextVersion(restored, event, clock.now);
  return {
    ok: true,
    event: next,
    history: historyEntry(event, next, { actor: "user", label: `Undo: ${entry.label}`.slice(0, 200), ops: [] }, clock),
  };
}

export interface DecideCommandResult {
  event: EventDoc;
  proposal: Proposal;
  results: DecisionResult[];
  /** Present when the decisions applied ops (a new plan version). */
  history: HistoryDoc | null;
}

/**
 * Decide on a stored proposal (spec 12.1, the only path that applies proposal ops). Accepted ops
 * make a new version and a history entry; a decline only touches `dismissedIdeaTitles`.
 */
export function decide(event: EventDoc, proposal: Proposal, decisions: Decision[], clock: Clock): DecideCommandResult {
  const outcome = decideProposal(event, proposal, decisions, clock);
  if (outcome.applied.length === 0) {
    const plan = { ...outcome.plan, updatedAt: sameJson(outcome.plan, event) ? event.updatedAt : clock.now };
    assertPlanInvariants(plan);
    return { event: plan, proposal: outcome.proposal, results: outcome.results, history: null };
  }
  const next = nextVersion(outcome.plan, event, clock.now);
  const label = historyLabel(event, outcome.applied, clock.today);
  const history = historyEntry(
    event,
    next,
    { actor: "user_via_ai", label, ops: outcome.applied, ...(proposal.id ? { proposalId: proposal.id } : {}) },
    clock,
  );
  return { event: next, proposal: outcome.proposal, results: outcome.results, history };
}

/** "Looks good" on the review banner: no plan change and no version bump (spec 12.1 PUT /review). */
export function markReviewed(event: EventDoc, section: ReviewSection, state: "reviewed" | "reset", now: string): EventDoc | null {
  if (!event.review) return null;
  return { ...event, review: { ...event.review, [section]: state }, updatedAt: now };
}

/** `stats.pending` (spec 8.2): undecided valid items in proposals that have not expired. */
export function pendingStats(proposals: Proposal[], now: string): PlanStats["pending"] {
  const live = proposals.filter((proposal) => proposal.expireAt > now);
  const count = live.reduce((n, proposal) => n + proposal.items.filter((item) => item.status === "pending").length, 0);
  const expireAt = live
    .filter((p) => p.items.some((item) => item.status === "pending"))
    .reduce<string | null>((latest, p) => (!latest || p.expireAt > latest ? p.expireAt : latest), null);
  return { count, expireAt };
}
