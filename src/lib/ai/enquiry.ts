import { z } from "zod";
import { DRAFT_LIMITS, withPlaceholder, type EnquiryOptions, type EnquiryText } from "@/lib/domain/enquiry";
import type { EventDoc, VendorDoc } from "@/lib/domain/model/event";
import { jsonSchemaOf, MAX_OUTPUT_TOKENS, type PlanModel } from "./model";
import { textFilter } from "./outputFilter";
import { buildEnquiryPrompt, ENQUIRY_SYSTEM, ENQUIRY_TEMPERATURE } from "./prompts/enquiry";
import { generateValidated } from "./reply";

/**
 * Vendor enquiry drafts (T5, spec 6.6). The model writes the text; code filters contact details
 * and business names, makes sure the greeting names `[Vendor name]` and keeps the channel's
 * length. The sign-off is added afterwards by the caller, so no name reaches the model.
 */

export const enquiryReplySchema = z.object({
  subject: z.string().max(240),
  body: z.string().min(1).max(3_000),
  placeholders: z.array(z.string().max(40)).max(10).default([]),
});
const responseSchema = jsonSchemaOf(enquiryReplySchema);

export async function enquiryText(
  model: PlanModel,
  plan: EventDoc,
  vendor: VendorDoc,
  options: EnquiryOptions,
  signal?: AbortSignal,
): Promise<EnquiryText & { filtered: boolean }> {
  const reply = await generateValidated(
    model,
    {
      systemInstruction: ENQUIRY_SYSTEM,
      prompt: buildEnquiryPrompt(plan, vendor, options),
      responseSchema,
      temperature: ENQUIRY_TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal,
    },
    enquiryReplySchema,
  );
  const filter = textFilter([...options.questions, plan.details.city, vendor.category]);
  const body = withPlaceholder(filter.clean(reply.body), options.language).slice(0, DRAFT_LIMITS[options.channel]);
  const subject = options.channel === "email" ? filter.clean(reply.subject).slice(0, 120) : "";
  return { subject, body, filtered: filter.filtered };
}
