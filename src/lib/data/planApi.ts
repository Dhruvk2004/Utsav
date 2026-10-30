import { z } from "zod";
import type { ReviewSection } from "@/lib/domain/model/enums";
import { eventDocSchema, type EventDoc } from "@/lib/domain/model/event";
import { ITEM_STATUSES, proposalSchema, type Decision, type Proposal } from "@/lib/domain/model/records";
import type { OpResult } from "@/lib/domain/ops/apply";
import type { DecisionResult } from "@/lib/domain/ops/decide";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { Api, ApiRequestError } from "./api";

/**
 * One event's plan endpoints (spec 12.1), as `ServerPlanStore` and the workspace use them. Errors
 * are `ApiRequestError`s; a 409 version conflict carries the latest event in its body.
 */

export interface ProposalRequest {
  touchpoint: Proposal["touchpoint"];
  baseVersion: number;
  instruction: string;
  items: { id?: string; op: PlanOperation; dependsOn: string[]; rationale: string }[];
}

export type StoredProposal = Proposal & { id: string };

export interface Applied {
  event: EventDoc;
  historyId: string;
}

export interface Decided {
  event: EventDoc;
  proposal: Proposal;
  historyId: string | null;
  results: DecisionResult[];
}

export interface OpenedEvent {
  event: EventDoc;
  /** The deployment has an AI model; without one, AI-only controls say so (MQW-07, CO-08). */
  aiAvailable: boolean;
}

export interface PlanApi {
  get(signal?: AbortSignal): Promise<EventDoc | null>;
  /** The event and whether AI is configured, or null for a 404. */
  open(signal?: AbortSignal): Promise<OpenedEvent | null>;
  /** Unexpired stored proposals that still have undecided items, oldest first (CO-02). */
  waiting(signal?: AbortSignal): Promise<StoredProposal[]>;
  patch(baseVersion: number, ops: PlanOperation[]): Promise<Applied>;
  undo(historyId: string): Promise<Applied>;
  review(section: ReviewSection, state: "reviewed" | "reset"): Promise<void>;
  createProposal(request: ProposalRequest): Promise<StoredProposal>;
  decide(proposalId: string, baseVersion: number, decisions: Decision[]): Promise<Decided>;
  share(options: { showAmounts: boolean; showNotes: boolean }): Promise<string>;
  revokeShare(): Promise<void>;
  remove(confirmTitle: string): Promise<void>;
}

const appliedSchema = z.object({ event: eventDocSchema, historyId: z.string() });
const decisionResultSchema = z.object({
  itemId: z.string(),
  ok: z.boolean(),
  status: z.enum(ITEM_STATUSES).optional(),
  reason: z.string().optional(),
});
const decidedSchema = z.object({
  event: eventDocSchema,
  proposal: proposalSchema,
  historyId: z.string().nullable(),
  results: z.array(decisionResultSchema),
});

const opResultsSchema = z.array(z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]));

/** The per-op results a 422 carries (the failed op has the reason), if any. */
export function rejectedResults(body: Record<string, unknown>): OpResult[] | null {
  const parsed = opResultsSchema.safeParse(body.results);
  return parsed.success ? parsed.data : null;
}

/** Reads the latest event out of a version-conflict body, if it carries one. */
export function conflictEvent(body: Record<string, unknown>): EventDoc | null {
  const parsed = eventDocSchema.safeParse(body.event);
  return parsed.success ? parsed.data : null;
}

export class HttpPlanApi implements PlanApi {
  private readonly base: string;

  constructor(
    eventId: string,
    private readonly api = new Api(),
  ) {
    this.base = `/api/events/${encodeURIComponent(eventId)}`;
  }

  async get(signal?: AbortSignal): Promise<EventDoc | null> {
    return (await this.open(signal))?.event ?? null;
  }

  async open(signal?: AbortSignal): Promise<OpenedEvent | null> {
    const schema = z.object({ event: eventDocSchema, ai: z.object({ available: z.boolean() }).optional() });
    try {
      const { event, ai } = await this.api.request(this.base, schema, { signal });
      return { event, aiAvailable: ai?.available ?? true };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  }

  async waiting(signal?: AbortSignal): Promise<StoredProposal[]> {
    const schema = z.object({ proposals: z.array(proposalSchema.extend({ id: z.string() })) });
    return (await this.api.request(`${this.base}/proposals`, schema, { signal })).proposals;
  }

  patch(baseVersion: number, ops: PlanOperation[]): Promise<Applied> {
    return this.api.request(this.base, appliedSchema, { method: "PATCH", body: { baseVersion, ops } });
  }

  undo(historyId: string): Promise<Applied> {
    return this.api.request(`${this.base}/undo`, appliedSchema, { method: "POST", body: { historyId } });
  }

  async review(section: ReviewSection, state: "reviewed" | "reset"): Promise<void> {
    await this.api.request(`${this.base}/review`, z.unknown(), { method: "PUT", body: { section, state } });
  }

  async createProposal(request: ProposalRequest): Promise<StoredProposal> {
    const schema = z.object({ proposal: proposalSchema.extend({ id: z.string() }) });
    return (await this.api.request(`${this.base}/proposals`, schema, { method: "POST", body: request })).proposal;
  }

  decide(proposalId: string, baseVersion: number, decisions: Decision[]): Promise<Decided> {
    return this.api.request(`${this.base}/proposals/${encodeURIComponent(proposalId)}/decide`, decidedSchema, {
      method: "POST",
      body: { baseVersion, decisions },
    });
  }

  async share(options: { showAmounts: boolean; showNotes: boolean }): Promise<string> {
    return (await this.api.request(`${this.base}/share`, z.object({ url: z.string() }), { method: "POST", body: options })).url;
  }

  async revokeShare(): Promise<void> {
    await this.api.request(`${this.base}/share`, z.unknown(), { method: "DELETE" });
  }

  async remove(confirmTitle: string): Promise<void> {
    await this.api.request(this.base, z.unknown(), { method: "DELETE", body: { confirmTitle } });
  }
}
