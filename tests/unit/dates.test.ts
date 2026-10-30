import { describe, expect, it } from "vitest";
import {
  formatWeekdayDate,
  weekdayName,
  addDays,
  daysBetween,
  formatDisplayDate,
  isValidTime,
  parseIsoDate,
  resolveWeekday,
  todayInIndia,
  toIsoDate,
  validateEventDate,
} from "@/lib/domain/dates";

describe("date helpers", () => {
  it("parses and formats ISO dates without timezone drift", () => {
    expect(toIsoDate(parseIsoDate("2027-02-14"))).toBe("2027-02-14");
  });

  it("rejects invalid dates", () => {
    expect(() => parseIsoDate("2027-13-45")).toThrow(RangeError);
  });

  it("adds and subtracts days across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("counts days between dates in either direction", () => {
    expect(daysBetween("2026-11-01", "2026-11-11")).toBe(10);
    expect(daysBetween("2026-11-11", "2026-11-01")).toBe(-10);
  });

  it("uses India's calendar date for today", () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India (UTC+5:30).
    expect(todayInIndia(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
  });

  it("formats dates for display", () => {
    expect(formatDisplayDate("2027-02-14")).toBe("14 Feb 2027");
  });
});

describe("validateEventDate", () => {
  it("accepts today and future dates", () => {
    expect(validateEventDate("2026-11-01", "2026-11-01")).toBeNull();
    expect(validateEventDate("2027-06-01", "2026-11-01")).toBeNull();
  });

  it("rejects past dates", () => {
    expect(validateEventDate("2026-10-31", "2026-11-01")).toMatch(/past/);
  });

  it("rejects dates more than two years out", () => {
    expect(validateEventDate("2029-01-01", "2026-11-01")).toMatch(/two years/);
  });
});

describe("resolveWeekday", () => {
  it("finds the weekday on or before the event date, across a month boundary", () => {
    expect(resolveWeekday("2026-12-27", "friday")).toBe("2026-12-25");
    expect(resolveWeekday("2026-12-27", "sunday")).toBe("2026-12-27");
    expect(resolveWeekday("2026-12-01", "saturday")).toBe("2026-11-28");
  });
});

describe("isValidTime", () => {
  it.each([
    ["00:00", true],
    ["19:30", true],
    ["23:59", true],
    ["24:00", false],
    ["7:30", false],
    ["12:60", false],
  ])("judges %s", (value, ok) => {
    expect(isValidTime(value)).toBe(ok);
  });
});

describe("weekday helpers", () => {
  it("names the weekday and formats card dates", () => {
    expect(weekdayName("2026-12-14")).toBe("Mon");
    expect(weekdayName("2026-12-14", "long")).toBe("Monday");
    expect(formatWeekdayDate("2026-12-14")).toBe("Mon 14 Dec 2026");
  });
});
