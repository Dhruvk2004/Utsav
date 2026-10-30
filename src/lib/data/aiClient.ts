import type { WorkspaceTab } from "@/lib/client/workspace";
import { smartRows, type WhatIfRow } from "@/lib/client/whatif";
import { RECORDINGS, recordedInstructDraft, recordingDraft, type RecordedReason } from "@/lib/demo/recordings";
import weddingWhatIf from "@/lib/demo/recorded/wedding-whatif.json";
import type { DemoSample } from "@/lib/demo/resolveDates";
import { templateEnquiry, type EnquiryOptions, type EnquiryText } from "@/lib/domain/enquiry";
import type { IdeaCategory } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Proposal } from "@/lib/domain/model/records";
import { buildProposal } from "@/lib/plan/proposals";
import { smartReplySchema, tradeoffItem, type SmartReply } from "@/lib/plan/smartPlan";
import type { PreviousTurn } from "@/lib/plan/PlanStore";
import { wait } from "./wait";

/**
 * How the UI asks for AI suggestions (spec 6.3-6.6). `HttpAiClient` and `SandboxAiClient`
 * (httpAiClient.ts) implement it over the `/api/events/[id]/ai/*` and `/api/demo/[sample]/ai/*`
 * routes; `RecordedAiClient` answers from the recorded proposals, dry-run against the plan the
 * user sees: the demo's What-if and enquiry drafts, and component tests.
 */

export interface InstructRequest {
  instruction: string;
  tab: WorkspaceTab;
  previousTurns: readonly PreviousTurn[];
}

export interface IdeasRequest {
  focus: IdeaCategory[];
  instruction: string;
}

export interface WhatIfRequest {
  newTotal: number;
  protect: string[];
  instruction: string;
}

export interface AiResult {
  proposal: Proposal;
  /** The answer came from a recording ("Recorded example - live AI is busy"). */
  recorded: boolean;
  /** Why it was recorded: live AI busy or failing, or not configured at all ("off", MQW-08). */
  reason?: RecordedReason;
}

export interface SmartPlan {
  rows: WhatIfRow[];
  ignored: string[];
  notes: string[];
  /** Trade-off items (`add_idea` / `add_task`) as a `whatif` proposal; empty when there are none. */
  tradeoffs: Proposal;
}

export interface EnquiryDraft extends EnquiryText {
  origin: "ai" | "template";
  /** Set for drafts the server made, so saving it unchanged keeps its origin (spec 8.2). */
  generatedDraftId?: string;
  /** The output filter removed something ("Some details were removed"). */
  filtered?: boolean;
}

export type AiErrorKind = "unavailable" | "not_configured" | "rate_limited" | "sandbox_invalid";

/** A request that failed in a way the UI explains (spec 3.4 AI failed, rate limited; 10.19 Reset sample). */
export class AiRequestError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    readonly retryAfterMinutes = 0,
  ) {
    super(kind);
  }
}

export interface AiClient {
  instruct(request: InstructRequest, signal?: AbortSignal): Promise<AiResult>;
  ideas(request: IdeasRequest, signal?: AbortSignal): Promise<AiResult>;
  whatif(request: WhatIfRequest, signal?: AbortSignal): Promise<SmartPlan>;
  enquiry(vendorId: string, options: EnquiryOptions, signal?: AbortSignal): Promise<EnquiryDraft>;
}

/** Recorded smart re-plans; samples without one show the "Smart re-plan is unavailable" state. */
export const WHATIF_RECORDINGS: Partial<Record<DemoSample, SmartReply>> = { wedding: smartReplySchema.parse(weddingWhatIf) };

/** The fake AI client: recorded proposals for the closest example, after a short "thinking" delay. */
export class RecordedAiClient implements AiClient {
  constructor(
    private readonly sample: DemoSample,
    private readonly plan: () => EventDoc,
    private readonly today: string,
    private readonly latencyMs = 900,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private clock() {
    return { today: this.today, now: this.now() };
  }

  async instruct({ instruction }: InstructRequest, signal?: AbortSignal): Promise<AiResult> {
    await wait(this.latencyMs, signal);
    const draft = recordedInstructDraft(this.sample, instruction, "busy");
    return { proposal: buildProposal(this.plan(), draft, this.clock()), recorded: true, reason: "busy" };
  }

  async ideas({ instruction }: IdeasRequest, signal?: AbortSignal): Promise<AiResult> {
    await wait(this.latencyMs, signal);
    const draft = recordingDraft(RECORDINGS[this.sample].ideas, instruction);
    return { proposal: buildProposal(this.plan(), draft, this.clock()), recorded: true };
  }

  async whatif({ newTotal, protect }: WhatIfRequest, signal?: AbortSignal): Promise<SmartPlan> {
    await wait(this.latencyMs, signal);
    const recording = WHATIF_RECORDINGS[this.sample];
    if (!recording) throw new AiRequestError("unavailable");
    const plan = this.plan();
    const { rows, ignored } = smartRows(plan, newTotal, recording.lines, protect);
    const tradeoffs = buildProposal(
      plan,
      { touchpoint: "whatif", origin: "ai", instruction: "", items: recording.tradeoffs.map(tradeoffItem), fallback: true },
      this.clock(),
    );
    return { rows, ignored, notes: recording.notes, tradeoffs };
  }

  async enquiry(vendorId: string, options: EnquiryOptions, signal?: AbortSignal): Promise<EnquiryDraft> {
    await wait(this.latencyMs / 3, signal);
    const plan = this.plan();
    const vendor = plan.vendors.find((v) => v.id === vendorId);
    if (!vendor) throw new AiRequestError("unavailable");
    return { ...templateEnquiry(plan, vendor, options), origin: "template" };
  }
}
