import { describe, expect, it } from "vitest";
import {
  ageBand,
  ANNIVERSARY_MILESTONES,
  BASIS_INPUTS,
  budgetTier,
  CONTINGENCY_PERCENT,
  costBand,
  dietaryWarning,
  filterBasis,
  OCCASION_IDEAS,
  seasonOf,
} from "@/lib/domain/personalisation";
import { OCCASIONS } from "@/lib/domain/model/enums";

describe("basis keys", () => {
  it("keeps only keys from the inputs table, with or without a value", () => {
    expect(filterBasis(["honoree.age", "honoree.interests:cartoons", "details.occasion:diwali", "honoree.name", "made.up:x"])).toEqual([
      "honoree.age",
      "honoree.interests:cartoons",
      "details.occasion:diwali",
    ]);
  });

  it("never lists names, notes, titles or vendor contacts as inputs", () => {
    expect(BASIS_INPUTS.map((i) => i.key).filter((key) => /name|notes|title|label|contact/.test(key))).toEqual([]);
  });
});

describe("rule tables", () => {
  it.each([
    [200, "simple"],
    [500, "standard"],
    [1_499, "standard"],
    [1_500, "premium"],
    [4_000, "luxury"],
  ] as const)("puts ₹%i per guest in the %s tier", (perGuest, tier) => {
    expect(budgetTier(perGuest)).toBe(tier);
  });

  it.each([
    [0, "0-2"],
    [6, "6-9"],
    [12, "10-12"],
    [29, "18-29"],
    [85, "60+"],
  ] as const)("puts age %i in band %s", (age, band) => {
    expect(ageBand(age)).toBe(band);
  });

  it("has idea families for every occasion and named anniversaries", () => {
    expect(Object.keys(OCCASION_IDEAS).sort()).toEqual([...OCCASIONS].sort());
    expect(OCCASION_IDEAS.diwali).toContain("rangoli competition");
    expect(ANNIVERSARY_MILESTONES[25]).toBe("silver");
    expect(CONTINGENCY_PERCENT).toEqual({ simple: 10, balanced: 8, all_out: 5 });
  });

  it("bands cities and seasons", () => {
    expect(costBand(" Pune ")).toBe("metro");
    expect(costBand("Nashik")).toBe("standard");
    expect(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10", "2026-12-10"].map(seasonOf)).toEqual([
      "winter",
      "summer",
      "monsoon",
      "autumn",
      "winter",
    ]);
  });
});

describe("dietaryWarning", () => {
  const food = { category: "food" as const, title: "Aloo tikki", description: "With potato and onion" };

  it("flags food ideas with blocked ingredients", () => {
    expect(dietaryWarning(food, ["jain"])).toBe("May not suit Jain guests");
    expect(dietaryWarning(food, ["veg", "no_onion_garlic"])).toBe("May not suit guests avoiding onion and garlic");
  });

  it("leaves other ideas and diets alone", () => {
    expect(dietaryWarning({ ...food, category: "decor" }, ["jain"])).toBeNull();
    expect(dietaryWarning(food, ["veg"])).toBeNull();
    expect(dietaryWarning({ ...food, description: "Paneer sliders", title: "Sliders" }, ["jain"])).toBeNull();
  });
});
