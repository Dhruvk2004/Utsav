import { z } from "zod";
import { libraryIdeas } from "@/lib/domain/ideaLibrary";
import { COST_BASES, EFFORTS, IDEA_CATEGORIES } from "@/lib/domain/model/enums";
import type { EventDoc, IdeaFields } from "@/lib/domain/model/event";
import { normaliseTitle } from "@/lib/domain/ops/context";
import { filterBasis } from "@/lib/domain/personalisation";
import type { ProposalDraft } from "@/lib/plan/proposals";
import type { AiProfile } from "./context";
import { jsonSchemaOf, MAX_OUTPUT_TOKENS, type PlanModel } from "./model";
import { textFilter } from "./outputFilter";
import { buildIdeasPrompt, IDEAS_SYSTEM, IDEAS_TEMPERATURE, type IdeasPromptInput } from "./prompts/ideas";
import { generateValidated } from "./reply";
import { EmptyReplyError } from "./instruct";

/**
 * Personalised ideas (T4, spec 6.5): the model's ideas are trimmed, filtered, their `basis` keys
 * checked against the 7.1 inputs, and repeats of existing or dismissed ideas dropped. The library
 * stands in when the model is unavailable, labelled "From Utsav's idea library".
 */

export const MAX_IDEAS = 6;

export const ideasReplySchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        description: z.string().max(600),
        category: z.enum(IDEA_CATEGORIES),
        estimatedCost: z.number().int().min(0).nullable(),
        costBasis: z.enum(COST_BASES),
        basis: z.array(z.string().max(80)).max(10),
        effort: z.enum(EFFORTS),
      }),
    )
    .min(1)
    .max(8),
});
const responseSchema = jsonSchemaOf(ideasReplySchema);

function fresh(plan: EventDoc, ideas: IdeaFields[]): IdeaFields[] {
  const taken = new Set([...plan.ideas.map((i) => normaliseTitle(i.title)), ...plan.dismissedIdeaTitles]);
  return ideas.filter((idea) => {
    const key = normaliseTitle(idea.title);
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
}

const asDraft = (ideas: IdeaFields[], instruction: string, rest: Partial<ProposalDraft>): ProposalDraft => ({
  touchpoint: "ideas",
  origin: "ai",
  instruction,
  items: ideas.slice(0, MAX_IDEAS).map((idea) => ({ op: { type: "add_idea", idea } })),
  ...rest,
});

export async function ideasDraft(
  model: PlanModel,
  plan: EventDoc,
  profile: AiProfile | null,
  input: IdeasPromptInput,
  today: string,
  signal?: AbortSignal,
): Promise<ProposalDraft> {
  const started = Date.now();
  const reply = await generateValidated(
    model,
    {
      systemInstruction: IDEAS_SYSTEM,
      prompt: buildIdeasPrompt(plan, profile, input, today),
      responseSchema,
      temperature: IDEAS_TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal,
    },
    ideasReplySchema,
  );
  const filter = textFilter([input.instruction]);
  const ideas = fresh(
    plan,
    reply.ideas.map((idea) => ({
      ...idea,
      title: filter.clean(idea.title).slice(0, 80),
      description: filter.clean(idea.description).slice(0, 300),
      basis: filterBasis(idea.basis),
    })),
  ).filter((idea) => idea.title.length > 0);
  if (ideas.length === 0) throw new EmptyReplyError();
  return asDraft(ideas, input.instruction, { model: model.name, latencyMs: Date.now() - started, filtered: filter.filtered });
}

/** The fallback: the idea library filtered by the section 7 rules, or null when nothing fits. */
export function libraryDraft(plan: EventDoc, input: IdeasPromptInput): ProposalDraft | null {
  const ideas = libraryIdeas(plan, input.focus, MAX_IDEAS);
  return ideas.length === 0 ? null : asDraft(ideas, input.instruction, { origin: "library", model: "library", fallback: true });
}
