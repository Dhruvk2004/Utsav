import { describe, expect, it } from "vitest";
import { sameJson, sameValue } from "@/lib/domain/equality";

describe("sameValue", () => {
  it("compares nested data ignoring key order", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([], {})).toBe(false);
    expect(sameValue(null, {})).toBe(false);
  });
});

describe("sameJson", () => {
  it("ignores keys holding undefined, as storage would", () => {
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson(undefined, undefined)).toBe(true);
    expect(sameJson({ a: 1 }, undefined)).toBe(false);
  });
});
