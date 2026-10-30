import { z } from "zod";
import { freeText } from "@/lib/domain/schemas";
import { instructDraft } from "@/lib/ai/instruct";
import { WORKSPACE_TABS } from "@/lib/client/workspace";
import { demoFixture } from "@/lib/demo/fixtures";
import { recordedInstructDraft } from "@/lib/demo/recordings";
import type { ProposalDraft } from "@/lib/plan/proposals";
import { replaceEarlierChanges, replacesEarlier, stepsFromOps } from "@/lib/plan/replaceEarlier";
import { SANDBOX_MAX_OPS } from "@/lib/plan/SandboxPlanStore";
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

/** `POST /api/demo/[sample]/ai/instruct` (public, spec 5.10): AI mode on a sample, live or recorded. */

const instructSchema = z.strictObject({
  instruction: freeText(DEMO_INSTRUCTION_MAX).pipe(z.string().min(1)),
  tab: z.enum(WORKSPACE_TABS).default("overview"),
  ...sandboxFields,
  // Which applied ops came from an "instead" answer (MQR-02 d). It only picks the base a second
  // "instead" is measured from; the rewritten op is still checked against the replayed plan.
  replacingOps: z
    .array(
      z
        .int()
        .min(0)
        .max(SANDBOX_MAX_OPS - 1),
    )
    .max(SANDBOX_MAX_OPS)
    .default([]),
});

type Params = Promise<{ sample: string }>;

export async function demoInstruct(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const sample = sampleOf((await params).sample);
  if (!sample) return notFound();
  const body = await readJson(request, instructSchema, DEMO_MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const clock = deps.clock();
  const sandbox = replay(sample, body.data.appliedOps, clock.today);
  if (!sandbox) return sandboxInvalid();
  const { instruction, tab, previousTurns } = body.data;
  const key = `demo:${sample}:${stableKey({ ...body.data, today: clock.today })}`;
  const cached = deps.caches.suggestions.get(key);
  // A follow-up that replaces an earlier change is measured from before it (MQW-06, MQR-02). Undo
  // drops ops from `appliedOps`, so only changes still in effect are replayed.
  const replaced = (draft: ProposalDraft) =>
    replacesEarlier(draft.instruction)
      ? replaceEarlierChanges(
          draft,
          sandbox.plan,
          stepsFromOps(demoFixture(sample, clock.today).event, body.data.appliedOps, clock.today, new Set(body.data.replacingOps)),
        )
      : draft;
  if (cached) return answer(sandbox.plan, replaced(cached), clock, false);
  if (deps.model && (await mayCallModel(request, deps, clock.today))) {
    try {
      const draft = await instructDraft(deps.model, sandbox.plan, { instruction, tab, previousTurns }, clock.today, request.signal);
      deps.caches.suggestions.set(key, draft);
      return answer(sandbox.plan, replaced(draft), clock, false);
    } catch (error) {
      logFailure(deps, "demo_instruct", error);
    }
  }
  const reason = deps.model ? "busy" : "off";
  return answer(sandbox.plan, recordedInstructDraft(sample, instruction, reason), clock, true, reason);
}

export const POST = (request: Request, context: { params: Params }) => demoInstruct(request, runtime(), context.params);
