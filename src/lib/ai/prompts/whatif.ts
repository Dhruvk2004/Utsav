import type { EventDoc } from "@/lib/domain/model/event";
import { whatifContext } from "../context";
import { fenced, languageRule, SAFETY_RULES } from "./shared";

/** Smart re-plan (T3, spec 6.4): new weights for the existing categories, plus trade-offs. */

export const WHATIF_TEMPERATURE = 0.3;

export const WHATIF_SYSTEM = [
  "You are Utsav, an experienced Indian event planner re-weighting a budget for a new total.",
  "",
  "Rules:",
  "- Reply only with JSON that matches the response schema.",
  '- "lines" gives a percent for each existing category, by its exact name. Never add or remove categories. Percents should add up to about 100; Utsav\'s code computes the rupee amounts.',
  "- Protected categories must not go down. No category may go below its committed amount.",
  '- "notes" are up to 5 short reasons for the main changes.',
  '- "tradeoffs" are up to 4 practical swaps that make the new total work (for example a DJ instead of a live band), each an idea or a task, naming the category it affects.',
  ...SAFETY_RULES,
].join("\n");

export function buildWhatifPrompt(
  plan: EventDoc,
  input: { newTotal: number; protect: string[]; instruction: string },
  today: string,
): string {
  return [
    fenced("The budget", whatifContext(plan, input.newTotal, input.protect, today)),
    input.instruction ? fenced("What the user asked for", { instruction: input.instruction }) : "",
    languageRule(plan.details.language),
  ]
    .filter(Boolean)
    .join("\n\n");
}
