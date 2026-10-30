import { describe, expect, it } from "vitest";
import { formatRupeesInput, groupIndian, parseRupees, perGuestText } from "@/lib/client/money";

describe("money helpers", () => {
  it("groups digits the Indian way", () => {
    expect(groupIndian(2_500_000)).toBe("25,00,000");
    expect(groupIndian(100_000_000)).toBe("10,00,00,000");
  });

  it("parses what people type", () => {
    expect(parseRupees("₹ 25,00,000")).toBe(2_500_000);
    expect(parseRupees("abc")).toBeNull();
    expect(formatRupeesInput("2500000")).toBe("25,00,000");
    expect(formatRupeesInput("")).toBe("");
  });

  it("keeps the decimal point, so paise never multiply the amount by 100 (QA-09 regression)", () => {
    expect(parseRupees("2,400.50")).toBe(2_400);
    expect(parseRupees("Rs. 5,000/-")).toBe(5_000);
    expect(parseRupees("INR 750")).toBe(750);
    expect(parseRupees(".50")).toBe(0);
    expect(formatRupeesInput("2400.")).toBe("2,400.");
    expect(formatRupeesInput("2400.505")).toBe("2,400.50");
    expect(formatRupeesInput(formatRupeesInput("2400.") + "5")).toBe("2,400.5");
    expect(formatRupeesInput(".5")).toBe("0.5");
    expect(formatRupeesInput(".")).toBe("");
    expect(formatRupeesInput("₹ 1,00,000")).toBe("1,00,000");
  });

  it("refuses signs, exponents and stray text instead of reading their digits (QA-09 regression)", () => {
    expect(parseRupees("-500")).toBeNull();
    expect(parseRupees("1e6")).toBeNull();
    expect(parseRupees("12 lakh")).toBeNull();
    expect(parseRupees("1.2.3")).toBeNull();
    expect(parseRupees("")).toBeNull();
    expect(parseRupees("₹")).toBeNull();
  });

  it("builds the per-guest helper only from usable numbers", () => {
    expect(perGuestText(2_500_000, 350)).toBe("About ₹7,142 per guest");
    expect(perGuestText(null, 350)).toBeNull();
    expect(perGuestText(2_500_000, 0)).toBeNull();
    expect(perGuestText(2_500_000, null)).toBeNull();
  });
});
