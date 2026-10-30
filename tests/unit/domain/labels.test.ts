import { describe, expect, it } from "vitest";
import { defaultEventTitle, ordinal } from "@/lib/domain/labels";

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [60, "60th"],
    [102, "102nd"],
    [111, "111th"],
  ])("%i -> %s", (n, text) => expect(ordinal(n)).toBe(text));
});

describe("defaultEventTitle", () => {
  const base = { occasion: null, occasionOther: "", milestone: null } as const;
  it.each([
    [{ ...base, eventType: "birthday", milestone: 6 }, "6th birthday"],
    [{ ...base, eventType: "birthday" }, "Birthday"],
    [{ ...base, eventType: "anniversary", milestone: 60 }, "60th anniversary"],
    [{ ...base, eventType: "anniversary" }, "Anniversary"],
    [{ ...base, eventType: "wedding" }, "Wedding"],
    [{ ...base, eventType: "community", occasion: "diwali" }, "Diwali celebration"],
    [{ ...base, eventType: "other", occasion: "housewarming" }, "Housewarming"],
    [{ ...base, eventType: "other", occasion: "other", occasionOther: " Society's 25th foundation day " }, "Society's 25th foundation day"],
    [{ ...base, eventType: "other", occasion: "other" }, "Celebration"],
    [{ ...base, eventType: "community" }, "Community event"],
    [{ ...base, eventType: "other" }, "Celebration"],
  ] as const)("%o -> %s", (parts, title) => expect(defaultEventTitle(parts)).toBe(title));
});
