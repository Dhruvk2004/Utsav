import { z } from "zod";
import type { EventDoc } from "@/lib/domain/model/event";
import { decisionSchema } from "@/lib/domain/model/records";
import type { DecisionResult } from "@/lib/domain/ops/decide";
import { CONFLICT_MESSAGE, decide } from "@/lib/plan/commands";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { errorResponse, json, MAX_APPLY_BODY_BYTES, notFound, readJson } from "../http";
import { EventRepo, type StoredProposal } from "../repos/events";
import { runtime } from "../runtime";
import { MAX_ITEMS, withPending } from "./proposals";

/**
 * `POST /api/events/[id]/proposals/[pid]/decide` (spec 12.1): the only path that applies proposal
 * ops. Accept, edit, decline and restore follow the shared `decideProposal` rules; accepted ops
 * make one new version and one history entry, and `stats.pending` is recounted.
 */

const decideSchema = z.strictObject({ baseVersion: z.number().int().min(0), decisions: z.array(decisionSchema).min(1).max(MAX_ITEMS) });

type Outcome =
  | { kind: "missing" }
  | { kind: "expired" }
  | { kind: "conflict"; event: EventDoc }
  | { kind: "done"; event: EventDoc; proposal: StoredProposal; historyId: string | null; results: DecisionResult[] };

type Params = Promise<{ id: string; pid: string }>;

export async function decideProposal(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, decideSchema, MAX_APPLY_BODY_BYTES);
  if (!body.ok) return body.response;
  const clock = deps.clock();
  const { id, pid } = await params;
  const outcome = await new EventRepo(auth.db).withEvent(id, auth.session.uid, async (event, tx): Promise<Outcome> => {
    const stored = await tx.proposal(pid);
    if (!stored) return { kind: "missing" };
    if (stored.expireAt <= clock.now) return { kind: "expired" };
    if (body.data.baseVersion !== event.version) return { kind: "conflict", event };
    const result = decide(event, stored, body.data.decisions, clock);
    const proposal = { ...result.proposal, id: pid };
    const saved = await withPending(tx, result.event, pid, proposal, clock.now);
    const historyId = result.history ? tx.addHistory(result.history) : null;
    tx.saveProposal(pid, proposal);
    tx.saveEvent(saved);
    return { kind: "done", event: saved, proposal, historyId, results: result.results };
  });
  const result = outcome?.value ?? { kind: "missing" };
  switch (result.kind) {
    case "missing":
      return notFound();
    case "expired":
      return errorResponse(410, "proposal_expired", "These suggestions have expired. Ask again for fresh ones.");
    case "conflict":
      return errorResponse(409, "version_conflict", CONFLICT_MESSAGE, { event: result.event });
    case "done":
      return json({ event: result.event, proposal: result.proposal, historyId: result.historyId, results: result.results });
  }
}

export const POST = (request: Request, context: { params: Params }) => decideProposal(request, runtime(), context.params);
