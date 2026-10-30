import { z } from "zod";
import { freeText } from "@/lib/domain/schemas";
import { instructDraft } from "@/lib/ai/instruct";
import { WORKSPACE_TABS } from "@/lib/client/workspace";
import type { PreviousTurn } from "@/lib/plan/PlanStore";
import { replaceEarlierChanges, replacesEarlier, stepsFromHistory } from "@/lib/plan/replaceEarlier";
import { stableKey } from "../../cache";
import type { ServerDeps } from "../../deps";
import { json } from "../../http";
import { EventRepo } from "../../repos/events";
import { runtime } from "../../runtime";
import { aiNotConfigured, aiUnavailable, logFailure, openAiCall, saveProposal, spendAi } from "./gate";

/**
 * `POST /api/events/[id]/ai/instruct` (T2, spec 6.3): the instruction, the last four AI-mode turns
 * from this event's unexpired proposals, and the plan go to the model; every call it returns is a
 * card, dry-run against the stored plan and stored as a proposal for `decide`.
 */

const PREVIOUS_TURNS = 4;
/** History entries an "instead" follow-up looks back through for the change it replaces. */
const HISTORY_WINDOW = 20;
const instructSchema = z.strictObject({
  instruction: freeText(500).pipe(z.string().min(1)),
  tab: z.enum(WORKSPACE_TABS).default("overview"),
});

type Params = Promise<{ id: string }>;

export async function instructEvent(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const gate = await openAiCall(request, deps, params, instructSchema);
  if (!gate.ok) return gate.response;
  const { call } = gate;
  const repo = new EventRepo(call.db);
  const recent = await repo.recentProposals(call.eventId, "instruct", call.clock.now, PREVIOUS_TURNS);
  const previousTurns: PreviousTurn[] = recent.map((p) => ({
    instruction: p.instruction,
    items: p.items.map(({ summary, status }) => ({ summary, status })),
  }));
  const input = { ...call.body, previousTurns };
  const key = `${call.session.uid}:${call.eventId}:${call.event.version}:${stableKey({ ...input, today: call.clock.today })}`;
  let draft = deps.caches.suggestions.get(key);
  if (!draft) {
    if (!deps.model) return aiNotConfigured();
    const refused = await spendAi(deps, call.db, call.session, call.clock);
    if (refused) return refused;
    try {
      draft = await instructDraft(deps.model, call.event, input, call.clock.today, request.signal);
    } catch (error) {
      logFailure(deps, "instruct", error);
      return aiUnavailable();
    }
    deps.caches.suggestions.set(key, draft);
    deps.log("ai_answered", {
      touchpoint: "instruct",
      uid: call.session.uid,
      items: draft.items.length,
      latencyMs: draft.latencyMs,
      model: draft.model,
    });
  }
  // A follow-up that replaces an earlier change is measured from before that change, as the history
  // records it: undone changes and changes since are taken into account (MQW-06, MQR-02).
  if (replacesEarlier(draft.instruction)) {
    const replacing = new Set(recent.filter((p) => replacesEarlier(p.instruction)).map((p) => p.id));
    draft = replaceEarlierChanges(draft, call.event, stepsFromHistory(await repo.recentHistory(call.eventId, HISTORY_WINDOW), replacing));
  }
  const proposal = await saveProposal(call, draft);
  return proposal ? json({ proposal, recorded: false }, { status: 201 }) : aiUnavailable();
}

export const POST = (request: Request, context: { params: Params }) => instructEvent(request, runtime(), context.params);
