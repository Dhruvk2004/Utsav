import { z } from "zod";
import { enquiryText } from "@/lib/ai/enquiry";
import { firstNameOf, signOff, templateEnquiry, type EnquiryOptions } from "@/lib/domain/enquiry";
import { DRAFT_CHANNELS } from "@/lib/domain/model/enums";
import { freeText, LANGUAGES } from "@/lib/domain/schemas";
import { stableKey } from "../../cache";
import type { GeneratedDraft, ServerDeps } from "../../deps";
import { json, notFound } from "../../http";
import { runtime } from "../../runtime";
import { logFailure, openAiCall, profileOf, spendAi, type AiCall } from "./gate";

/**
 * `POST /api/events/[id]/ai/enquiry` (T5, spec 6.6): a draft message for one vendor, never sent by
 * Utsav. The model writes it without any names; the sign-off is appended here. Any failure gives
 * the template draft. The returned `generatedDraftId` lets PATCH `save_draft` record the origin.
 */

const enquirySchema = z.strictObject({
  vendorId: z.string().min(1).max(80),
  channel: z.enum(DRAFT_CHANNELS),
  language: z.enum(LANGUAGES),
  tone: z.enum(["warm", "formal"]),
  includeBudget: z.boolean(),
  questions: z.array(freeText(160)).max(8),
  signWithName: z.boolean().default(false),
});
type EnquiryBody = z.output<typeof enquirySchema>;

type Params = Promise<{ id: string }>;

/** The model's draft (cached 10 min by vendor and options), or the template when AI is unavailable. */
async function draftFor(deps: ServerDeps, call: AiCall<EnquiryBody>, options: EnquiryOptions, signal: AbortSignal) {
  const vendor = call.event.vendors.find((v) => v.id === call.body.vendorId);
  if (!vendor) return null;
  const key = `${call.session.uid}:${call.eventId}:${stableKey({ options, vendor: vendor.id, version: call.event.version })}`;
  const cached = deps.caches.enquiries.get(key);
  if (cached) return cached;
  if (deps.model && !(await spendAi(deps, call.db, call.session, call.clock))) {
    try {
      const text = { ...(await enquiryText(deps.model, call.event, vendor, options, signal)), origin: "ai" as const };
      deps.caches.enquiries.set(key, text);
      return text;
    } catch (error) {
      logFailure(deps, "enquiry", error);
    }
  }
  return { ...templateEnquiry(call.event, vendor, options), origin: "template" as const, filtered: false };
}

export async function draftEnquiry(request: Request, deps: ServerDeps, params: Params): Promise<Response> {
  const gate = await openAiCall(request, deps, params, enquirySchema);
  if (!gate.ok) return gate.response;
  const { call } = gate;
  const { vendorId, signWithName, ...options } = call.body;
  const draft = await draftFor(deps, call, options, request.signal);
  if (!draft) return notFound();
  const name = signWithName ? firstNameOf((await profileOf(call.db, call.session.uid))?.displayName ?? call.session.name) : "";
  const body = signOff(draft.body, name, options.channel);
  const generatedDraftId = `gen-${Buffer.from(deps.randomBytes(9)).toString("base64url")}`;
  const generated: GeneratedDraft = { vendorId, body, origin: draft.origin };
  deps.caches.generatedDrafts.set(`${call.session.uid}:${call.eventId}:${generatedDraftId}`, generated);
  return json({ draft: { subject: draft.subject, body, origin: draft.origin, filtered: draft.filtered, generatedDraftId } });
}

export const POST = (request: Request, context: { params: Params }) => draftEnquiry(request, runtime(), context.params);
