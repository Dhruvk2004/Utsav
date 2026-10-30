import { buildPlan } from "@/lib/domain/planner";
import { aiPlanDraftSchema, type AiPlanDraft, type EventInput, type EventPlan } from "@/lib/domain/schemas";
import { templateDraft } from "@/lib/domain/template";
import type { PlanModel } from "./model";
import { buildPlanPrompt, EMPTY_CONTEXT, SYSTEM_INSTRUCTION, type PlanContext } from "./prompts/plan";
import { MAX_ATTEMPTS, parseReply } from "./reply";

/** Parses and validates raw model output. Tolerates a ```json fence around the payload. */
export function parseDraft(raw: string): AiPlanDraft {
  return parseReply(raw, aiPlanDraftSchema, "the plan format");
}

export type PlanServiceDeps = {
  model: PlanModel | null;
  today: string;
  /** Personalisation without names or the title (spec 6.2). */
  context?: PlanContext;
  now?: Date;
  signal?: AbortSignal;
  onError?: (error: unknown, attempt: number) => void;
};

/**
 * Asks the model for a draft (retrying once on a bad reply), then builds the plan in code.
 * If the model is missing or keeps failing, returns the template plan with a notice.
 */
export async function generatePlan(input: EventInput, deps: PlanServiceDeps): Promise<EventPlan> {
  if (deps.model) {
    const prompt = buildPlanPrompt(input, deps.today, deps.context ?? EMPTY_CONTEXT);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (deps.signal?.aborted) break;
      try {
        const raw = await deps.model.generateJson({ systemInstruction: SYSTEM_INSTRUCTION, prompt, signal: deps.signal });
        return buildPlan(input, parseDraft(raw), { today: deps.today, source: "ai", now: deps.now });
      } catch (error) {
        deps.onError?.(error, attempt);
      }
    }
  }

  const plan = buildPlan(input, templateDraft(input, deps.context?.occasion ?? null), {
    today: deps.today,
    source: "template",
    now: deps.now,
  });
  plan.warnings.unshift(
    deps.model
      ? "The AI planner is busy right now, so this is a standard template. Try again in a minute for a personalised plan."
      : "AI planning is not configured, so this is a standard template.",
  );
  return plan;
}
