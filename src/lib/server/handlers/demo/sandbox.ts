import { z } from "zod";
import { freeText } from "@/lib/domain/schemas";
import { demoFixture } from "@/lib/demo/fixtures";
import { DEMO_SAMPLES, type DemoSample } from "@/lib/demo/resolveDates";
import { planInvariantViolations } from "@/lib/domain/invariants";
import type { EventDoc } from "@/lib/domain/model/event";
import { ITEM_STATUSES } from "@/lib/domain/model/records";
import type { PlanProfile } from "@/lib/domain/model/user";
import { applyOperations } from "@/lib/domain/ops/apply";
import { proposableOperationSchema } from "@/lib/domain/ops/schema";
import type { Clock } from "@/lib/plan/commands";
import type { RecordedReason } from "@/lib/demo/recordings";
import { buildProposal, type ProposalDraft } from "@/lib/plan/proposals";
import { SANDBOX_MAX_OPS, SANDBOX_MAX_TURNS } from "@/lib/plan/SandboxPlanStore";
import type { ServerDeps } from "../../deps";
import { errorResponse, isSameOrigin, json } from "../../http";
import { clientIp } from "../../rateLimit";

/**
 * The public demo's AI routes (spec 5.10 b, 9.1): no auth and nothing stored. The server never
 * takes a plan from the browser: it loads the pristine sample and replays the visitor's accepted
 * ops (proposable types only, at most 20). Live AI is limited to 5 calls an hour per IP and a
 * global daily cap; past either, or when the model fails, a recorded proposal answers, re-checked
 * against the replayed plan.
 */

/** 20 ops and 4 turns fit with room to spare (a unit test builds the largest realistic body). */
export const DEMO_MAX_BODY_BYTES = 8_000;
export const DEMO_INSTRUCTION_MAX = 300;

const turnSchema = z.strictObject({
  instruction: freeText(DEMO_INSTRUCTION_MAX),
  items: z.array(z.strictObject({ summary: z.string().max(300), status: z.enum(ITEM_STATUSES) })).max(10),
});

export const sandboxFields = {
  appliedOps: z.array(proposableOperationSchema).max(SANDBOX_MAX_OPS),
  previousTurns: z.array(turnSchema).max(SANDBOX_MAX_TURNS).default([]),
};

export const sandboxInvalid = () =>
  errorResponse(400, "SANDBOX_STATE_INVALID", "This sample can't be rebuilt from your changes. Reset the sample to continue.");

export function sampleOf(value: string): DemoSample | null {
  return (DEMO_SAMPLES as readonly string[]).includes(value) ? (value as DemoSample) : null;
}

/** The sample as the visitor sees it: the pristine fixture with their accepted ops replayed (actor `user`). */
export function replay(
  sample: DemoSample,
  appliedOps: z.output<typeof sandboxFields.appliedOps>,
  today: string,
): { plan: EventDoc; profile: PlanProfile } | null {
  const fixture = demoFixture(sample, today);
  const run = applyOperations(fixture.event, appliedOps, { today, actor: "user" });
  if (run.results.some((result) => !result.ok) || planInvariantViolations(run.plan).length > 0) return null;
  return { plan: run.plan, profile: fixture.profile };
}

/**
 * Whether this request may call the model: sent by the app's own pages, within the per-IP hourly
 * limit and the global daily cap. A request from another site, or without an Origin, is answered
 * with a recording, so no website can spend the live quota through its visitors' browsers (SEC-14).
 */
export async function mayCallModel(request: Request, deps: ServerDeps, today: string): Promise<boolean> {
  if (!isSameOrigin(request, deps.appOrigin)) return false;
  if (!deps.limits.demo.check(clientIp(request.headers)).allowed) return false;
  return deps.demoQuota.consume(today);
}

/** The proposal (not stored) with every item dry-run against the replayed plan. */
export function answer(plan: EventDoc, draft: ProposalDraft, clock: Clock, recorded: boolean, reason?: RecordedReason): Response {
  return json({ proposal: buildProposal(plan, draft, clock), recorded, ...(recorded && reason ? { reason } : {}) });
}
