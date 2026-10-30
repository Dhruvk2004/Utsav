import { describe, expect, it } from "vitest";
import { INDIAN_CITIES, suggestCities } from "@/lib/domain/cities";

describe("cities", () => {
  it("lists forty distinct cities", () => {
    expect(INDIAN_CITIES).toHaveLength(40);
    expect(new Set(INDIAN_CITIES.map((c) => c.name)).size).toBe(40);
  });

  it("puts prefix matches first, then other matches, case-insensitively", () => {
    expect(suggestCities("pu").map((c) => c.name)).toEqual(["Pune", "Puducherry", "Jaipur", "Kanpur", "Nagpur", "Thiruvananthapuram"]);
    expect(suggestCities("PUNE")).toEqual([{ name: "Pune", state: "Maharashtra" }]);
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(suggestCities("  ")).toEqual([]);
    expect(suggestCities("a", 3)).toHaveLength(3);
  });
});
