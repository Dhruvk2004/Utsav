import { describe, expect, it } from "vitest";
import { profileFieldErrors, toggleIn, toggleTradition } from "@/lib/client/profileForm";

describe("toggleIn", () => {
  it("adds and removes", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("toggleTradition", () => {
  it("makes Prefer not to say exclusive", () => {
    expect(toggleTradition(["marathi", "punjabi"], "undisclosed")).toEqual(["undisclosed"]);
    expect(toggleTradition(["undisclosed"], "tamil")).toEqual(["tamil"]);
    expect(toggleTradition(["tamil"], "tamil")).toEqual([]);
  });

  it("stops at six", () => {
    const six = ["marathi", "punjabi", "tamil", "bengali", "sikh", "jain"] as const;
    expect(toggleTradition([...six], "parsi")).toEqual([...six]);
  });
});

describe("profileFieldErrors", () => {
  it("checks only the fields given", () => {
    expect(profileFieldErrors({})).toEqual({});
    expect(profileFieldErrors({ displayName: "  ", homeCity: "P" })).toEqual({
      displayName: "Enter your name.",
      homeCity: "Enter your city.",
    });
    expect(profileFieldErrors({ displayName: "a".repeat(61), homeCity: "b".repeat(61) })).toEqual({
      displayName: "Use 60 characters or fewer.",
      homeCity: "Use 60 characters or fewer.",
    });
  });

  it("checks the Mixed/other text only when that chip is chosen", () => {
    expect(profileFieldErrors({ traditions: ["mixed_other"], traditionOther: "x".repeat(61) })).toEqual({
      traditionOther: "Use 60 characters or fewer.",
    });
    expect(profileFieldErrors({ traditions: ["tamil"], traditionOther: "x".repeat(61) })).toEqual({});
    expect(profileFieldErrors({ traditions: ["mixed_other"] })).toEqual({});
  });
});
