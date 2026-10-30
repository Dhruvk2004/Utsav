import { z } from "zod";
import { whatifReply } from "@/lib/ai/whatif";
import { freeText, LIMITS } from "@/lib/domain/schemas";
import { buildProposal } from "@/lib/plan/proposals";
import { tradeoffItem, whatifInstruction } from "@/lib/plan/smartPlan";
import { stableKey } from "../../cache";
import type { ServerDeps } from "../../deps";
import { json } from "../../http";
import { runtime } from "../../runtime";
import { aiNotConfigured, aiUnavailable, logFailure, openAiCall, saveProposal, spendAi } from "./gate";

/**
 * `POST /api/events/[id]/ai/whatif` (T3, spec 6.4): new weights for the existing categories, short
 * notes, and trade-offs stored as a `whatif` proposal (each an idea or task card). The client maps
 * the weights onto its table with `smartRows`; when this fails, Simple rescale still works.
 */

const whatifSchema = z.strictObject({
  newTotal: z.number().int().min(LIMITS.minBudget).max(LIMITS.maxBudget),
  protect: z.array(z.string().min(1).max(80)).max(20).default([]),
  instruction: freeText(500).default(""),
});

type Params = Promise<{ id: string }>;

export async function smartReplan(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const gate = await openAiCall(request, deps, params, whatifSchema);
  if (!gate.ok) return gate.response;
  const { call } = gate;
  const key = `${call.session.uid}:${call.eventId}:${call.event.version}:${stableKey(call.body)}`;
  let reply = deps.caches.smartPlans.get(key);
  if (!reply) {
    if (!deps.model) return aiNotConfigured();
    const refused = await spendAi(deps, call.db, call.session, call.clock);
    if (refused) return refused;
    try {
      reply = await whatifReply(deps.model, call.event, call.body, call.clock.today, request.signal);
    } catch (error) {
      logFailure(deps, "whatif", error);
      return aiUnavailable();
    }
    deps.caches.smartPlans.set(key, reply);
  }
  const draft = {
    touchpoint: "whatif" as const,
    origin: "ai" as const,
    instruction: whatifInstruction(call.body.newTotal, call.body.instruction),
    items: reply.tradeoffs.map(tradeoffItem),
    model: deps.model?.name ?? "cached",
    filtered: reply.filtered,
  };
  // Trade-offs are cards to decide, so they are stored; a re-plan without any needs no proposal.
  const tradeoffs = draft.items.length > 0 ? await saveProposal(call, draft) : buildProposal(call.event, draft, call.clock);
  if (!tradeoffs) return aiUnavailable();
  return json({ lines: reply.lines, notes: reply.notes, tradeoffs });
}

export const POST = (request: Request, context: { params: Params }) => smartReplan(request, runtime(), context.params);
