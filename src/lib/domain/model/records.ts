import { z } from "zod";
import { planOperationSchema } from "../ops/schema";
import { eventDocSchema, isoDate, isoDateTime } from "./event";

/** Proposal, history, share and demo-usage documents (spec 8.2). */

export const TOUCHPOINTS = ["instruct", "whatif", "ideas", "questions", "add_to_plan", "catering", "fix", "reset"] as const;
export const PROPOSAL_ORIGINS = ["ai", "library", "code"] as const;
export const ITEM_STATUSES = ["pending", "accepted", "edited", "declined", "invalid", "expired"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const proposalItemSchema = z.object({
  id: z.string().min(1),
  op: planOperationSchema,
  /** Code-generated `describeOperation` label, reused as plan-chat context. */
  summary: z.string().max(300),
  dependsOn: z.array(z.string()),
  status: z.enum(ITEM_STATUSES),
  reason: z.string().optional(),
  rationale: z.string().max(160),
});

export const proposalSchema = z.object({
  /** The document id, present once the server has stored the proposal (never written into the doc). */
  id: z.string().min(1).optional(),
  touchpoint: z.enum(TOUCHPOINTS),
  origin: z.enum(PROPOSAL_ORIGINS),
  instruction: z.string().max(500),
  baseVersion: z.number().int().min(0),
  items: z.array(proposalItemSchema),
  reply: z.string().max(400).nullable(),
  model: z.string(),
  latencyMs: z.number().min(0),
  fallback: z.boolean(),
  /** The output filter removed something ("Some details were removed", spec 6.12). */
  filtered: z.boolean().optional(),
  createdAt: isoDateTime,
  expireAt: isoDateTime,
});

export const decisionSchema = z.strictObject({
  itemId: z.string().min(1),
  action: z.enum(["accept", "decline", "restore"]),
  editedOp: planOperationSchema.optional(),
});

export type ProposalItem = z.infer<typeof proposalItemSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Decision = z.infer<typeof decisionSchema>;

export const historySchema = z.object({
  actor: z.enum(["user", "user_via_ai", "system"]),
  label: z.string().max(200),
  ops: z.array(planOperationSchema),
  /** The proposal an AI change was decided on, so a follow-up can tell what it replaced (MQR-02). */
  proposalId: z.string().min(1).max(80).optional(),
  /** Snapshot of the sections the batch touched, so undo can restore them. */
  before: eventDocSchema.partial(),
  versionBefore: z.number().int().min(0),
  versionAfter: z.number().int().min(0),
  createdAt: isoDateTime,
  expireAt: isoDateTime,
});
export type HistoryDoc = z.infer<typeof historySchema>;

export const shareDocSchema = z.object({
  eventId: z.string().min(1),
  ownerUid: z.string().min(1),
  showAmounts: z.boolean(),
  showNotes: z.boolean(),
  createdAt: isoDateTime,
  revokedAt: isoDateTime.nullable(),
});
export type ShareDoc = z.infer<typeof shareDocSchema>;

export const demoUsageSchema = z.object({ day: isoDate, count: z.number().int().min(0) });
