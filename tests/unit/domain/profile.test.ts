import { describe, expect, it } from "vitest";
import { aiUsedToday, applyProfilePatch, profilePatchSchema } from "@/lib/domain/model/user";
import { STUB_PROFILE } from "../../helpers/stubServices";

const now = "2026-10-28T06:00:00.000Z";

describe("profilePatchSchema and applyProfilePatch", () => {
  it("merges fields, cleaning text", () => {
    const next = applyProfilePatch(STUB_PROFILE, { homeCity: "  Pune ", traditions: ["marathi"] }, now);
    expect(next.homeCity).toBe("Pune");
    expect(next.traditions).toEqual(["marathi"]);
    expect(next.displayName).toBe(STUB_PROFILE.displayName);
  });

  it("sets onboardedAt once and never clears or moves it", () => {
    const onboarded = applyProfilePatch(STUB_PROFILE, { markOnboarded: true }, now);
    expect(onboarded.onboardedAt).toBe(now);
    expect(applyProfilePatch(onboarded, { markOnboarded: true }, "2027-01-01T00:00:00.000Z").onboardedAt).toBe(now);
    expect(applyProfilePatch(onboarded, { language: "hi" }, "2027-01-01T00:00:00.000Z").onboardedAt).toBe(now);
    expect(applyProfilePatch(STUB_PROFILE, { language: "hi" }, now).onboardedAt).toBeNull();
  });

  it("rejects unknown fields, blank names and too many traditions", () => {
    expect(profilePatchSchema.safeParse({ email: "x@example.com" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ traditions: ["marathi", "punjabi", "tamil", "bengali", "sikh", "jain", "parsi"] }).success).toBe(
      false,
    );
    expect(() => applyProfilePatch(STUB_PROFILE, { homeCity: "P" }, now)).toThrow();
  });
});

describe("aiUsedToday", () => {
  it("counts only today's calls", () => {
    expect(aiUsedToday({ aiUsage: { day: "2026-10-28", count: 12 } }, "2026-10-28")).toBe(12);
    expect(aiUsedToday({ aiUsage: { day: "2026-10-27", count: 12 } }, "2026-10-28")).toBe(0);
  });
});
