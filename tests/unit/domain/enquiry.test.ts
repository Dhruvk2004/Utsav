import { describe, expect, it } from "vitest";
import { DRAFT_LIMITS, shareLink, templateEnquiry, VENDOR_PLACEHOLDER, type EnquiryOptions } from "@/lib/domain/enquiry";
import { wedding } from "../../domainFixtures";

const plan = wedding();
const photographer = plan.vendors.find((v) => v.id === "vendor-photographer")!;
const base: EnquiryOptions = { channel: "whatsapp", language: "en", tone: "warm", includeBudget: false, questions: [] };

describe("template enquiry drafts (spec 6.6 fallback)", () => {
  it("greets with the placeholder and never includes the budget unless asked", () => {
    const draft = templateEnquiry(plan, photographer, base);
    expect(draft.subject).toBe("");
    expect(draft.body.startsWith(`Hi ${VENDOR_PLACEHOLDER},`)).toBe(true);
    expect(draft.body).toContain("wedding in Pune on 27 Dec 2026 for about 350 guests and are looking for a photographer");
    expect(draft.body).not.toContain("₹");
  });

  it("adds the budget, questions, a subject for email and the formal tone", () => {
    const draft = templateEnquiry(plan, photographer, {
      ...base,
      channel: "email",
      tone: "formal",
      includeBudget: true,
      questions: photographer.questions,
    });
    expect(draft.subject).toBe("Enquiry: Photographer for 27 Dec 2026");
    expect(draft.body).toContain(`Dear ${VENDOR_PLACEHOLDER},`);
    expect(draft.body).toContain("₹2,00,000");
    expect(draft.body).toContain("- How many edited photos are included?");
    expect(draft.body.length).toBeLessThanOrEqual(DRAFT_LIMITS.email);
  });

  it("writes Hindi drafts", () => {
    const warm = templateEnquiry(plan, photographer, { ...base, language: "hi", channel: "email", includeBudget: true, questions: ["?"] });
    expect(warm.body).toContain(`नमस्ते ${VENDOR_PLACEHOLDER},`);
    expect(warm.subject).toContain("पूछताछ");
    expect(
      templateEnquiry(plan, { ...photographer, budgetLineId: null }, { ...base, language: "hi", tone: "formal", includeBudget: true }).body,
    ).toMatch(/^आदरणीय/);
  });

  it("hands the text to the user's own app with no recipient", () => {
    expect(shareLink("whatsapp", { subject: "", body: "Hi there" })).toBe("https://wa.me/?text=Hi%20there");
    expect(shareLink("email", { subject: "Hi", body: "a&b" })).toBe("mailto:?subject=Hi&body=a%26b");
  });
});
