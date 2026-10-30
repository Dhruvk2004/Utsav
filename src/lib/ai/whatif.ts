import type { EventDoc } from "@/lib/domain/model/event";
import { smartReplySchema, type SmartReply } from "@/lib/plan/smartPlan";
import { jsonSchemaOf, MAX_OUTPUT_TOKENS, type PlanModel } from "./model";
import { textFilter } from "./outputFilter";
import { buildWhatifPrompt, WHATIF_SYSTEM, WHATIF_TEMPERATURE } from "./prompts/whatif";
import { generateValidated } from "./reply";

/**
 * Smart re-plan (T3, spec 6.4): the model's weights and trade-offs, with model text filtered.
 * Mapping weights onto the plan's own lines (`smartRows`) happens where the table is shown, so the
 * rows always match the plan on screen.
 */

const responseSchema = jsonSchemaOf(smartReplySchema);

export interface WhatifInput {
  newTotal: number;
  /** Line ids that may not decrease. */
  protect: string[];
  instruction: string;
}

export async function whatifReply(
  model: PlanModel,
  plan: EventDoc,
  input: WhatifInput,
  today: string,
  signal?: AbortSignal,
): Promise<SmartReply & { filtered: boolean }> {
  const reply = await generateValidated(
    model,
    {
      systemInstruction: WHATIF_SYSTEM,
      prompt: buildWhatifPrompt(plan, input, today),
      responseSchema,
      temperature: WHATIF_TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal,
    },
    smartReplySchema,
  );
  const filter = textFilter([input.instruction]);
  return {
    lines: reply.lines,
    notes: reply.notes.map(filter.clean),
    tradeoffs: reply.tradeoffs.map((t) => ({ ...t, title: filter.clean(t.title) || t.category, detail: filter.clean(t.detail) })),
    filtered: filter.filtered,
  };
}
