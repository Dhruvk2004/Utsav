import { z } from "zod";
import { smartRows } from "@/lib/client/whatif";
import type { DemoSample } from "@/lib/demo/resolveDates";
import type { EnquiryOptions } from "@/lib/domain/enquiry";
import type { EventDoc } from "@/lib/domain/model/event";
import { proposalSchema } from "@/lib/domain/model/records";
import type { SandboxPlanStore } from "@/lib/plan/SandboxPlanStore";
import { smartReplySchema } from "@/lib/plan/smartPlan";
import {
  AiRequestError,
  type AiClient,
  type AiResult,
  type EnquiryDraft,
  type IdeasRequest,
  type InstructRequest,
  type SmartPlan,
  type WhatIfRequest,
} from "./aiClient";
import { Api, ApiRequestError } from "./api";
import { isAbortError } from "./wait";

/**
 * The AI client over HTTP (spec 12.1): `/api/events/[id]/ai/*` for a signed-in event, and
 * `/api/demo/[sample]/ai/*` for the public demo, which sends the visitor's accepted ops and turns
 * so the server can rebuild the same sandbox plan. Failures become the `AiRequestError` kinds the
 * panel explains; an abort stays an abort.
 */

const resultSchema = z.object({ proposal: proposalSchema, recorded: z.boolean(), reason: z.enum(["busy", "off"]).optional() });
const statusSchema = z.object({ live: z.boolean() });
const smartSchema = z.object({ lines: smartReplySchema.shape.lines, notes: z.array(z.string()), tradeoffs: proposalSchema });
const enquirySchema = z.object({
  draft: z.object({
    subject: z.string(),
    body: z.string(),
    origin: z.enum(["ai", "template"]),
    filtered: z.boolean(),
    generatedDraftId: z.string(),
  }),
});

/** The panel's error kinds: rate limited (with minutes to wait), sandbox state invalid, or unavailable. */
export function aiError(error: unknown): unknown {
  if (isAbortError(error)) return error;
  if (error instanceof ApiRequestError && error.status === 429) {
    const seconds = Number(error.body.retryAfterSeconds) || 60;
    return new AiRequestError("rate_limited", Math.ceil(seconds / 60));
  }
  if (error instanceof ApiRequestError && error.code === "SANDBOX_STATE_INVALID") return new AiRequestError("sandbox_invalid");
  if (error instanceof ApiRequestError && error.code === "ai_not_configured") return new AiRequestError("not_configured");
  return new AiRequestError("unavailable");
}

async function call<S extends z.ZodType>(api: Api, path: string, schema: S, body: unknown, signal?: AbortSignal): Promise<z.output<S>> {
  try {
    return await api.request(path, schema, { method: "POST", body, signal });
  } catch (error) {
    throw aiError(error);
  }
}

/** Smart re-plan rows are mapped onto the plan on screen, so they always match what the user sees. */
function smartPlan(plan: EventDoc, request: WhatIfRequest, reply: z.output<typeof smartSchema>): SmartPlan {
  const { rows, ignored } = smartRows(plan, request.newTotal, reply.lines, request.protect);
  return { rows, ignored, notes: reply.notes, tradeoffs: reply.tradeoffs };
}

export class HttpAiClient implements AiClient {
  private readonly base: string;

  constructor(
    eventId: string,
    private readonly plan: () => EventDoc,
    private readonly api = new Api(),
  ) {
    this.base = `/api/events/${encodeURIComponent(eventId)}/ai`;
  }

  instruct({ instruction, tab }: InstructRequest, signal?: AbortSignal): Promise<AiResult> {
    return call(this.api, `${this.base}/instruct`, resultSchema, { instruction, tab }, signal);
  }

  ideas({ focus, instruction }: IdeasRequest, signal?: AbortSignal): Promise<AiResult> {
    return call(this.api, `${this.base}/ideas`, resultSchema, { focus, instruction }, signal);
  }

  async whatif(request: WhatIfRequest, signal?: AbortSignal): Promise<SmartPlan> {
    const reply = await call(this.api, `${this.base}/whatif`, smartSchema, request, signal);
    return smartPlan(this.plan(), request, reply);
  }

  async enquiry(vendorId: string, options: EnquiryOptions, signal?: AbortSignal): Promise<EnquiryDraft> {
    return (await call(this.api, `${this.base}/enquiry`, enquirySchema, { vendorId, ...options }, signal)).draft;
  }
}

/**
 * The demo's client: AI mode and ideas go to the sandbox routes with `appliedOps` and the previous
 * turns; What-if and enquiry drafts in the demo use the recordings and templates (`fallback`).
 */
export class SandboxAiClient implements AiClient {
  private readonly base: string;

  constructor(
    sample: DemoSample,
    private readonly store: SandboxPlanStore,
    private readonly fallback: AiClient,
    private readonly api = new Api(),
  ) {
    this.base = `/api/demo/${sample}/ai`;
  }

  instruct({ instruction, tab, previousTurns }: InstructRequest, signal?: AbortSignal): Promise<AiResult> {
    return call(
      this.api,
      `${this.base}/instruct`,
      resultSchema,
      { instruction, tab, appliedOps: this.store.appliedOps, replacingOps: this.store.replacingOps, previousTurns },
      signal,
    );
  }

  ideas({ focus, instruction }: IdeasRequest, signal?: AbortSignal): Promise<AiResult> {
    const dismissedTitles = this.store.getPlan().dismissedIdeaTitles;
    return call(
      this.api,
      `${this.base}/ideas`,
      resultSchema,
      { focus, instruction, dismissedTitles, appliedOps: this.store.appliedOps },
      signal,
    );
  }

  /** Whether the demo has live AI (MQR-03); null when that can't be told, so nothing is hidden. */
  async liveAi(signal?: AbortSignal): Promise<boolean | null> {
    try {
      return (await this.api.request(this.base, statusSchema, { signal })).live;
    } catch {
      return null;
    }
  }

  whatif(request: WhatIfRequest, signal?: AbortSignal): Promise<SmartPlan> {
    return this.fallback.whatif(request, signal);
  }

  enquiry(vendorId: string, options: EnquiryOptions, signal?: AbortSignal): Promise<EnquiryDraft> {
    return this.fallback.enquiry(vendorId, options, signal);
  }
}
