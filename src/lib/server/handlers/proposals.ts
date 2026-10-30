import { z } from "zod";
import { freeText } from "@/lib/domain/schemas";
import type { EventDoc } from "@/lib/domain/model/event";
import { TOUCHPOINTS, type Proposal } from "@/lib/domain/model/records";
import { proposableOperationSchema } from "@/lib/domain/ops/schema";
import { CONFLICT_MESSAGE, pendingStats } from "@/lib/plan/commands";
import { buildProposal } from "@/lib/plan/proposals";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { errorResponse, json, MAX_APPLY_BODY_BYTES, notFound, readJson } from "../http";
import { EventRepo, type EventTx, type StoredProposal } from "../repos/events";
import { runtime } from "../runtime";

/**
 * `POST /api/events/[id]/proposals` (spec 6.1, 12.1) stores a code-generated proposal ("Suggested
 * by Utsav": Add to plan, Reset section). The server assigns the origin, never the client, and
 * dry-runs every item against the stored plan.
 */

export const MAX_ITEMS = 20;
const itemId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

const createSchema = z
  .strictObject({
    touchpoint: z.enum(TOUCHPOINTS),
    baseVersion: z.number().int().min(0),
    instruction: freeText(500).default(""),
    items: z
      .array(
        z.strictObject({
          id: itemId.optional(),
          op: proposableOperationSchema,
          dependsOn: z.array(itemId).max(MAX_ITEMS).default([]),
          rationale: freeText(160).default(""),
        }),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .refine(({ items }) => {
    const ids = items.map((item, i) => item.id ?? `item-${i + 1}`);
    return new Set(ids).size === ids.length && items.every((item, i) => item.dependsOn.every((dep) => ids.slice(0, i).includes(dep)));
  }, "Item ids must be unique and depend only on earlier items");

/**
 * The event with `stats.pending` recounted for this proposal's new state (spec 8.2). It reads the
 * event's other proposals, so call it before the transaction's first write.
 */
export async function withPending(tx: EventTx, event: EventDoc, id: string, proposal: Proposal, now: string): Promise<EventDoc> {
  const others = (await tx.proposals()).filter((stored) => stored.id !== id);
  return { ...event, stats: { ...event.stats, pending: pendingStats([...others, proposal], now) } };
}

/**
 * Proposals one event keeps (SEC-12). They expire after a day, but the write rate limit alone would
 * allow about 86,000 a day; past the cap the oldest are deleted as a new one is stored.
 */
export const MAX_STORED_PROPOSALS = 50;

/** The stored proposals to delete so that one more fits under the cap: the oldest first. */
export function proposalsOverCap(stored: readonly StoredProposal[], cap = MAX_STORED_PROPOSALS): StoredProposal[] {
  const excess = stored.length - (cap - 1);
  return excess > 0 ? [...stored].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, excess) : [];
}

/** Stores a new proposal, keeping the event under the cap, and recounts its pending items, in the caller's transaction. */
export async function addProposal(tx: EventTx, event: EventDoc, proposal: Proposal, now: string): Promise<StoredProposal> {
  const id = tx.newProposalId();
  const stored = await tx.proposals();
  const dropped = new Set(proposalsOverCap(stored).map((old) => old.id));
  const kept = stored.filter((old) => !dropped.has(old.id));
  const next = { ...event, stats: { ...event.stats, pending: pendingStats([...kept, proposal], now) } };
  for (const old of dropped) tx.deleteProposal(old);
  tx.saveProposal(id, proposal);
  tx.saveEvent(next);
  return { ...proposal, id };
}

export async function createProposal(request: Request, deps: ServerDeps, params: Promise<{ id: string }>): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, createSchema, MAX_APPLY_BODY_BYTES);
  if (!body.ok) return body.response;
  const clock = deps.clock();
  const { touchpoint, baseVersion, instruction, items } = body.data;
  const outcome = await new EventRepo(auth.db).withEvent((await params).id, auth.session.uid, async (event, tx) => {
    if (baseVersion !== event.version) return { conflict: event } as const;
    const proposal = buildProposal(event, { touchpoint, origin: "code", instruction, items }, clock);
    return { proposal: await addProposal(tx, event, proposal, clock.now) } as const;
  });
  if (!outcome) return notFound();
  const result = outcome.value;
  if ("conflict" in result) return errorResponse(409, "version_conflict", CONFLICT_MESSAGE, { event: result.conflict });
  return json({ proposal: result.proposal }, { status: 201 });
}

/**
 * `GET /api/events/[id]/proposals`: the event's waiting proposals (unexpired, with undecided
 * items), so suggestions left undecided can be decided after a reload (CO-02, spec 6.1 (7)).
 */
export async function listWaiting(request: Request, deps: ServerDeps, params: Promise<{ id: string }>): Promise<Response> {
  const auth = await authorize(request, deps, "read");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const repo = new EventRepo(auth.db);
  if (!(await repo.owned(id, auth.session.uid))) return notFound();
  return json({ proposals: await repo.waitingProposals(id, deps.clock().now) });
}

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => createProposal(request, runtime(), context.params);
export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => listWaiting(request, runtime(), context.params);
