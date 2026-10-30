import { z } from "zod";
import { ideasDraft, libraryDraft } from "@/lib/ai/ideas";
import { IDEA_CATEGORIES } from "@/lib/domain/model/enums";
import type { ProposalDraft } from "@/lib/plan/proposals";
import { stableKey } from "../../cache";
import type { ServerDeps } from "../../deps";
import { json } from "../../http";
import { runtime } from "../../runtime";
import { aiUnavailable, logFailure, openAiCall, profileOf, saveProposal, spendAi, type AiCall } from "./gate";

/**
 * `POST /api/events/[id]/ai/ideas` (T4, spec 6.5): personalised ideas as an `ideas` proposal (nothing
 * is saved until the user saves a card). When the model is missing, busy, over a limit or fails,
 * the idea library answers instead, labelled "From Utsav's idea library".
 */

const ideasSchema = z.strictObject({
  focus: z.array(z.enum(IDEA_CATEGORIES)).max(IDEA_CATEGORIES.length).default([]),
  instruction: z.string().trim().max(500).default(""),
});
type IdeasBody = z.output<typeof ideasSchema>;

type Params = Promise<{ id: string }>;

async function live(deps: ServerDeps, call: AiCall<IdeasBody>, signal: AbortSignal): Promise<ProposalDraft | null> {
  const key = `${call.session.uid}:${call.eventId}:${call.event.version}:${stableKey({ ...call.body, today: call.clock.today })}`;
  const cached = deps.caches.suggestions.get(key);
  if (cached || !deps.model) return cached ?? null;
  if (await spendAi(deps, call.db, call.session, call.clock)) return null;
  try {
    const draft = await ideasDraft(deps.model, call.event, await profileOf(call.db, call.session.uid), call.body, call.clock.today, signal);
    deps.caches.suggestions.set(key, draft);
    return draft;
  } catch (error) {
    logFailure(deps, "ideas", error);
    return null;
  }
}

export async function suggestIdeas(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const gate = await openAiCall(request, deps, params, ideasSchema);
  if (!gate.ok) return gate.response;
  const draft = (await live(deps, gate.call, request.signal)) ?? libraryDraft(gate.call.event, gate.call.body);
  if (!draft) return aiUnavailable();
  const proposal = await saveProposal(gate.call, draft);
  return proposal ? json({ proposal, recorded: false }, { status: 201 }) : aiUnavailable();
}

export const POST = (request: Request, context: { params: Params }) => suggestIdeas(request, runtime(), context.params);
