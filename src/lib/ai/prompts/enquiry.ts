import { VENDOR_PLACEHOLDER, type EnquiryOptions } from "@/lib/domain/enquiry";
import type { EventDoc, VendorDoc } from "@/lib/domain/model/event";
import { enquiryContext } from "../context";
import { fenced, languageRule, SAFETY_RULES } from "./shared";

/** Vendor enquiry drafts (T5, spec 6.6). Utsav never sends them; the user copies or opens their own app. */

export const ENQUIRY_TEMPERATURE = 0.5;

export const ENQUIRY_SYSTEM = [
  "You are Utsav, helping a family write a first enquiry to a vendor for their event.",
  "",
  "Rules:",
  "- Reply only with JSON that matches the response schema.",
  `- Start the message by greeting "${VENDOR_PLACEHOLDER}" exactly like that; never invent the vendor's name.`,
  "- Keep it short and polite, ask the listed questions, and include only the details given. Share the budget only when it is given.",
  "- WhatsApp messages stay under 700 characters with no subject; emails stay under 1,500 characters with a subject under 120.",
  "- Use a culturally appropriate greeting only for a tradition that is listed. Do not sign the message; Utsav adds the sign-off.",
  ...SAFETY_RULES,
].join("\n");

export function buildEnquiryPrompt(plan: EventDoc, vendor: VendorDoc, options: EnquiryOptions): string {
  return [
    fenced("The enquiry", { ...enquiryContext(plan, vendor, options), channel: options.channel, tone: options.tone }),
    languageRule(options.language),
  ].join("\n\n");
}
