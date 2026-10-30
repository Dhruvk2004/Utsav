import type { EventDoc } from "@/lib/domain/model/event";
import type { ProposalDraft } from "@/lib/plan/proposals";
import type { PlanModel } from "./model";
import { textFilter } from "./outputFilter";
import { buildInstructPrompt, INSTRUCT_SYSTEM, INSTRUCT_TEMPERATURE, type InstructPromptInput } from "./prompts/instruct";
import { PLAN_TOOLS, toolCallsToItems } from "./tools";

/** At most 10 cards per request (spec 6.3). */
export const MAX_INSTRUCT_ITEMS = 10;

/** The model's reply had no card and no answer to show. */
export class EmptyReplyError extends Error {
  constructor() {
    super("The AI reply had no usable suggestions");
    this.name = "EmptyReplyError";
  }
}

/**
 * AI mode (T2): one function-calling request, mapped to proposal items against `plan`. The caller
 * builds and dry-runs the proposal, so every card's diff is computed by code.
 */
export async function instructDraft(
  model: PlanModel,
  plan: EventDoc,
  input: InstructPromptInput,
  today: string,
  signal?: AbortSignal,
): Promise<ProposalDraft> {
  const started = Date.now();
  const calls = await model.callTools({
    systemInstruction: INSTRUCT_SYSTEM,
    prompt: buildInstructPrompt(plan, input, today),
    tools: PLAN_TOOLS,
    temperature: INSTRUCT_TEMPERATURE,
    signal,
  });
  const filter = textFilter([input.instruction]);
  const { items, reply } = toolCallsToItems(calls, plan, today, filter.clean);
  if (items.length === 0 && !reply) throw new EmptyReplyError();
  return {
    touchpoint: "instruct",
    origin: "ai",
    instruction: input.instruction,
    items: items.slice(0, MAX_INSTRUCT_ITEMS),
    reply,
    model: model.name,
    latencyMs: Date.now() - started,
    filtered: filter.filtered,
  };
}
