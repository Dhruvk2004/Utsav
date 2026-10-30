import { describe, expect, it } from "vitest";
import { aiPlanDraftSchema, cleanText, eventInputSchema } from "@/lib/domain/schemas";
import { makeDraft } from "../fixtures";

const valid = {
  eventType: "birthday",
  eventDate: "2027-01-10",
  city: "Pune",
  guestCount: 40,
  budget: 60000,
};

describe("eventInputSchema", () => {
  it("accepts a minimal valid event and fills defaults", () => {
    expect(eventInputSchema.parse(valid)).toEqual({ ...valid, title: "", vibe: "", functions: [], language: "en" });
  });

  it("coerces numeric strings", () => {
    expect(eventInputSchema.parse({ ...valid, guestCount: "40", budget: "60000" }).budget).toBe(60000);
  });

  it.each([
    ["eventType", "funeral"],
    ["eventDate", "10/01/2027"],
    ["eventDate", "2027-02-30x"],
    ["city", "P"],
    ["guestCount", 0],
    ["guestCount", 12.5],
    ["guestCount", 10_001],
    ["budget", 999],
    ["budget", 1e12],
    ["vibe", "x".repeat(201)],
    ["functions", Array.from({ length: 9 }, (_, i) => `f${i}`)],
    ["language", "fr"],
  ])("rejects an invalid %s (%s)", (field, value) => {
    const result = eventInputSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path[0]).toBe(field);
  });

  it("cleans whitespace and control characters from free text", () => {
    const parsed = eventInputSchema.parse({ ...valid, city: "  New\u0000  Delhi\n", vibe: "fun\t\tand bright" });
    expect(parsed.city).toBe("New Delhi");
    expect(parsed.vibe).toBe("fun and bright");
  });
});

describe("cleanText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanText("  a \n\n b  ")).toBe("a b");
  });
});

describe("aiPlanDraftSchema", () => {
  it("accepts a well-formed draft", () => {
    expect(aiPlanDraftSchema.safeParse(makeDraft()).success).toBe(true);
  });

  it("fills optional lists with defaults", () => {
    const draft: Partial<ReturnType<typeof makeDraft>> = makeDraft();
    delete draft.functions;
    delete draft.ideas;
    const parsed = aiPlanDraftSchema.parse(draft);
    expect(parsed.functions).toEqual([]);
    expect(parsed.ideas).toEqual([]);
  });

  it("rejects percentages over 100 and negative offsets", () => {
    expect(aiPlanDraftSchema.safeParse(makeDraft({ budget: [{ category: "x", percent: 120, note: "" }] })).success).toBe(false);
    expect(aiPlanDraftSchema.safeParse(makeDraft({ tasks: [{ title: "x", category: "x", daysBefore: -8 }] })).success).toBe(false);
  });

  it("requires at least one task and vendor", () => {
    expect(aiPlanDraftSchema.safeParse(makeDraft({ tasks: [] })).success).toBe(false);
    expect(aiPlanDraftSchema.safeParse(makeDraft({ vendors: [] })).success).toBe(false);
  });
});
