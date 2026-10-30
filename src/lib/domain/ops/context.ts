import type { DraftOrigin, IdeaSource, Origin } from "../model/enums";
import type { EventDoc } from "../model/event";
import { slugId } from "../timeline";

export type Actor = "user" | "ai";
export type ProposalOrigin = "ai" | "library" | "code";

/** Everything `applyOperations` needs besides the plan and the ops (spec 12.2). */
export interface ApplyContext {
  today: string;
  /** `user` for manual edits (PATCH); `ai` for any op that arrived through a proposal. */
  actor: Actor;
  proposalOrigin?: ProposalOrigin;
  /** Timestamp written by this batch (doneAt, vendor history, drafts); defaults to midnight UTC of `today`. */
  now?: string;
  /** The user edited the proposal item before accepting, so text it writes is the user's. */
  edited?: boolean;
  /** Server lookup of a generated enquiry draft; returns its origin when the body is unchanged (spec 8.2). */
  draftOrigin?: (vendorId: string, generatedDraftId: string, body: string) => Exclude<DraftOrigin, "user"> | null;
}

/** A domain rule rejected the op; the message is shown to the user as the reason. */
export class OpError extends Error {}

export function fail(reason: string): never {
  throw new OpError(reason);
}

export function stampOf(ctx: ApplyContext): string {
  return ctx.now ?? `${ctx.today}T00:00:00.000Z`;
}

/** Provenance of an item written by this op (spec 6.1, "Server-assigned provenance"). */
export function itemOrigin(ctx: ApplyContext): Origin {
  if (ctx.actor === "user" || ctx.edited) return "user";
  return ctx.proposalOrigin === "code" ? "code" : "ai";
}

export function ideaSource(ctx: ApplyContext): IdeaSource {
  if (ctx.actor === "user" || ctx.proposalOrigin === "code") return "user";
  return ctx.proposalOrigin === "library" ? "library" : "ai";
}

/** Case-insensitive, whitespace-normalised key used for name matching and uniqueness. */
export function nameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalised idea title for `dismissedIdeaTitles`: lowercase, trimmed, punctuation stripped. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A readable id derived from the item's label, unique within `taken`. Ids are deterministic
 * so replaying the same ops on the same plan (server, sandbox, demo replay) gives the same ids.
 */
export function uniqueId(prefix: string, label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugId(prefix, label.slice(0, 40)).replace(/-$/, "");
  const root = base === prefix ? `${prefix}-item` : base;
  let candidate = root;
  for (let n = 2; used.has(candidate); n++) candidate = `${root}-${n}`;
  return candidate;
}

/** The fields of a partial patch that were actually given. */
export function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function findById<T extends { id: string }>(items: T[], id: string, what: string): T {
  const item = items.find((i) => i.id === id);
  return item ?? fail(`${what} not found in this plan`);
}

export function assertUniqueName(names: string[], candidate: string, what: string): void {
  if (names.some((n) => nameKey(n) === nameKey(candidate))) fail(`There is already ${what} called "${candidate}"`);
}

export function contingencyLine(plan: EventDoc) {
  return plan.budget.lines.find((line) => nameKey(line.category) === "contingency");
}
