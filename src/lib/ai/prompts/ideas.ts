import type { IdeaCategory } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import { BASIS_INPUTS } from "@/lib/domain/personalisation";
import { ideasContext, type AiProfile } from "../context";
import { fenced, languageRule, SAFETY_RULES } from "./shared";

/** Personalised ideas (T4, spec 6.5, section 7). */

export const IDEAS_TEMPERATURE = 0.8;

const BASIS_KEYS = BASIS_INPUTS.map((input) => input.key).join(", ");

export const IDEAS_SYSTEM = [
  "You are Utsav, an experienced Indian event planner suggesting personalised ideas for one event.",
  "",
  "Rules:",
  "- Reply only with JSON that matches the response schema: 4 to 6 ideas.",
  "- The strongest signal is the honorees' interests and age, then the occasion, milestone, functions, festival nearby, season, tradition, dietary needs, guests (kids, elderly, mobility), city cost band and budget tier.",
  "- Examples: a 6-year-old who loves cartoons gets character decor, a cartoon cake and a painting corner; Diwali gets a rangoli competition, diya painting and green-cracker alternatives; a 60th anniversary gets a photo wall by decade.",
  "- Do not rely on gender stereotypes; if gender is not given, do not assume it, and prefer interests. Suggest tradition-specific rituals only when that tradition is listed.",
  "- Respect dietary needs strictly: Jain means no root vegetables, onion or garlic.",
  "- Do not repeat an existing idea or anything like a dismissed one.",
  `- "basis" lists the inputs each idea used, as keys from this list, optionally with a value after a colon: ${BASIS_KEYS}. For example "honoree.interests:cartoons" or "details.occasion:diwali".`,
  '- "estimatedCost" is a rough estimate in rupees for the cost basis given, or null; it is never a quote. Keep ideas within the budget tier.',
  ...SAFETY_RULES,
].join("\n");

export interface IdeasPromptInput {
  focus: readonly IdeaCategory[];
  instruction: string;
}

export function buildIdeasPrompt(plan: EventDoc, profile: AiProfile | null, input: IdeasPromptInput, today: string): string {
  return [
    fenced("The event", ideasContext(plan, profile, today)),
    input.focus.length > 0 ? `Focus on these idea categories: ${input.focus.join(", ")}.` : "",
    input.instruction ? fenced("What the user asked for", { instruction: input.instruction }) : "",
    languageRule(plan.details.language),
  ]
    .filter(Boolean)
    .join("\n\n");
}
