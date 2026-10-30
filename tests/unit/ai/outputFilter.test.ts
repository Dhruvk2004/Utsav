import { describe, expect, it } from "vitest";
import { outputFilter, textFilter } from "@/lib/ai/outputFilter";

describe("outputFilter (spec 6.12)", () => {
  it.each([
    ["Call 98200 12345 to book", "Call to book"],
    ["Ring +91 98200-12345 today", "Ring today"],
    ["Mail hello@decor.example.com now", "Mail now"],
    ["See https://example.com/x for photos", "See for photos"],
    ["Visit www.shaadi-decor.in please", "Visit please"],
    ["Try lotusdecor.com first", "Try first"],
    ["Follow @lotus_decor for ideas", "Follow for ideas"],
    ["Book Lotus Decorators early.", "Book early."],
    ["Ask Sharma & Sons and Patel Caterers", "Ask and"],
  ])("removes %s", (input, output) => {
    expect(outputFilter(input)).toEqual({ text: output, filtered: true });
  });

  it("leaves dates, money, short numbers and plain text alone", () => {
    const text = "On 2026-12-14 spend ₹2,40,000 for 350 guests. Keep 20% aside.\nThen relax.";
    expect(outputFilter(text)).toEqual({ text, filtered: false });
  });

  it("keeps a business name the user typed themselves", () => {
    expect(outputFilter("Confirm with Lotus Decorators", ["Ask Lotus Decorators for a quote"]).filtered).toBe(false);
  });

  it("remembers across texts whether anything was removed", () => {
    const filter = textFilter([]);
    expect(filter.clean("Plain idea")).toBe("Plain idea");
    expect(filter.filtered).toBe(false);
    expect(filter.clean("Call 9820012345")).toBe("Call");
    expect(filter.filtered).toBe(true);
  });
});
