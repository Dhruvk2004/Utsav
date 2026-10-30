import { z } from "zod";
import { freeText } from "@/lib/domain/schemas";
import { ideasDraft } from "@/lib/ai/ideas";
import { RECORDINGS, recordingDraft } from "@/lib/demo/recordings";
import { CAPS } from "@/lib/domain/model/event";
import { IDEA_CATEGORIES } from "@/lib/domain/model/enums";
import { normaliseTitle } from "@/lib/domain/ops/context";
import { stableKey } from "../../cache";
import type { ServerDeps } from "../../deps";
import { notFound, readJson } from "../../http";
import { runtime } from "../../runtime";
import { logFailure } from "../ai/gate";
import {
  answer,
  DEMO_INSTRUCTION_MAX,
  DEMO_MAX_BODY_BYTES,
  mayCallModel,
  replay,
  sampleOf,
  sandboxFields,
  sandboxInvalid,
} from "./sandbox";

/**
 * `POST /api/demo/[sample]/ai/ideas` (public, spec 5.10): personalised ideas on a sample. Ideas the
 * visitor dismissed in this sandbox come along as `dismissedTitles`, so they are not suggested again.
 */

const ideasSchema = z.strictObject({
  focus: z.array(z.enum(IDEA_CATEGORIES)).max(IDEA_CATEGORIES.length).default([]),
  instruction: freeText(DEMO_INSTRUCTION_MAX).default(""),
  dismissedTitles: z.array(freeText(80)).max(CAPS.dismissedIdeaTitles).default([]),
  ...sandboxFields,
});

type Params = Promise<{ sample: string }>;

export async function demoIdeas(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const sample = sampleOf((await params).sample);
  if (!sample) return notFound();
  const body = await readJson(request, ideasSchema, DEMO_MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const clock = deps.clock();
  const sandbox = replay(sample, body.data.appliedOps, clock.today);
  if (!sandbox) return sandboxInvalid();
  const dismissed = [...new Set([...sandbox.plan.dismissedIdeaTitles, ...body.data.dismissedTitles.map(normaliseTitle)])].slice(
    -CAPS.dismissedIdeaTitles,
  );
  const plan = { ...sandbox.plan, dismissedIdeaTitles: dismissed };
  const { focus, instruction } = body.data;
  const key = `demo:${sample}:${stableKey({ ...body.data, today: clock.today })}`;
  const cached = deps.caches.suggestions.get(key);
  if (cached) return answer(plan, cached, clock, false);
  if (deps.model && (await mayCallModel(request, deps, clock.today))) {
    try {
      const draft = await ideasDraft(deps.model, plan, sandbox.profile, { focus, instruction }, clock.today, request.signal);
      deps.caches.suggestions.set(key, draft);
      return answer(plan, draft, clock, false);
    } catch (error) {
      logFailure(deps, "demo_ideas", error);
    }
  }
  return answer(plan, recordingDraft(RECORDINGS[sample].ideas, instruction), clock, true, deps.model ? "busy" : "off");
}

export const POST = (request: Request, context: { params: Params }) => demoIdeas(request, runtime(), context.params);
