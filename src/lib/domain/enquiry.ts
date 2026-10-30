import { formatCount, formatInr } from "./budget";
import { formatDisplayDate } from "./dates";
import { defaultEventTitle } from "./labels";
import type { DraftChannel } from "./model/enums";
import type { EventDoc, VendorDoc } from "./model/event";
import type { Language } from "./schemas";

/**
 * Vendor enquiry drafts (spec 6.6). These are the template drafts (one per channel and language)
 * that stand in when AI is unavailable. Utsav never sends anything: the user copies the text or
 * opens their own WhatsApp or email. The greeting always uses the `[Vendor name]` placeholder.
 */

export const VENDOR_PLACEHOLDER = "[Vendor name]";
export const DRAFT_LIMITS: Record<DraftChannel, number> = { whatsapp: 700, email: 1500 };

export interface EnquiryOptions {
  channel: DraftChannel;
  language: Language;
  tone: "warm" | "formal";
  includeBudget: boolean;
  questions: string[];
  /** Code appends "- {first name}" after the text; the name never goes to the model (spec 6.6). */
  signWithName?: boolean;
}

export interface EnquiryText {
  subject: string;
  body: string;
}

function budgetRange(vendor: VendorDoc, plan: EventDoc): number | null {
  return plan.budget.lines.find((line) => line.id === vendor.budgetLineId)?.amount ?? null;
}

export function templateEnquiry(plan: EventDoc, vendor: VendorDoc, options: EnquiryOptions): EnquiryText {
  const event = defaultEventTitle(plan.details).toLowerCase();
  const date = formatDisplayDate(plan.details.eventDate);
  const { city } = plan.details;
  const guests = formatCount(plan.guests.total);
  const budget = options.includeBudget ? budgetRange(vendor, plan) : null;
  const questions = options.questions.map((q) => `- ${q}`).join("\n");

  if (options.language === "hi") {
    const greeting = options.tone === "warm" ? `नमस्ते ${VENDOR_PLACEHOLDER},` : `आदरणीय ${VENDOR_PLACEHOLDER},`;
    const lines = [
      greeting,
      `हम ${date} को ${city} में ${guests} मेहमानों के लिए एक ${event} की योजना बना रहे हैं और ${vendor.category} की तलाश में हैं।`,
      budget !== null ? `हमारा अनुमानित बजट ${formatInr(budget)} है।` : "",
      questions ? `कृपया बताएँ:\n${questions}` : "",
      "धन्यवाद।",
    ];
    return {
      subject: options.channel === "email" ? `${vendor.category}: ${date} के लिए पूछताछ` : "",
      body: lines.filter(Boolean).join("\n\n").slice(0, DRAFT_LIMITS[options.channel]),
    };
  }

  const greeting = options.tone === "warm" ? `Hi ${VENDOR_PLACEHOLDER},` : `Dear ${VENDOR_PLACEHOLDER},`;
  const lines = [
    greeting,
    `We're planning a ${event} in ${city} on ${date} for about ${guests} guests and are looking for a ${vendor.category.toLowerCase()}.`,
    budget !== null ? `Our budget for this is around ${formatInr(budget)}.` : "",
    questions ? `Could you tell us:\n${questions}` : "",
    options.tone === "warm" ? "Thanks so much!" : "Thank you. We look forward to hearing from you.",
  ];
  return {
    subject: options.channel === "email" ? `Enquiry: ${vendor.category} for ${date}` : "",
    body: lines.filter(Boolean).join("\n\n").slice(0, DRAFT_LIMITS[options.channel]),
  };
}

/** The greeting always names `[Vendor name]`; a draft without it gets one in front. */
export function withPlaceholder(body: string, language: Language): string {
  if (body.includes(VENDOR_PLACEHOLDER)) return body;
  return `${language === "hi" ? "नमस्ते" : "Hi"} ${VENDOR_PLACEHOLDER},\n\n${body}`;
}

/** Appends the sign-off within the channel's length limit, shortening the body if it has to. */
export function signOff(body: string, firstName: string, channel: DraftChannel): string {
  const name = firstName.trim();
  if (!name) return body.slice(0, DRAFT_LIMITS[channel]);
  const tail = `\n\n- ${name}`;
  return `${body.slice(0, DRAFT_LIMITS[channel] - tail.length).trimEnd()}${tail}`;
}

/** The first word of a display name ("Ananya Kulkarni" is "Ananya"). */
export const firstNameOf = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? "";

/** Links that hand the draft to the user's own app; no phone number or address is ever filled in. */
export function shareLink(channel: DraftChannel, text: EnquiryText): string {
  if (channel === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(text.body)}`;
  return `mailto:?subject=${encodeURIComponent(text.subject)}&body=${encodeURIComponent(text.body)}`;
}
