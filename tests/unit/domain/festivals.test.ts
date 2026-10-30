import { describe, expect, it } from "vitest";
import { FESTIVAL_DATES, FESTIVAL_LABELS, FESTIVALS, nearestFestival, upcomingDates } from "@/lib/domain/festivals";

describe("festival table", () => {
  it("covers 2026 to 2028 for every festival, in order, with a label", () => {
    for (const festival of FESTIVALS) {
      expect(FESTIVAL_DATES[festival].map((d) => d.slice(0, 4))).toEqual(["2026", "2027", "2028"]);
      expect(FESTIVAL_LABELS[festival]).toBeTruthy();
    }
  });
});

describe("nearestFestival", () => {
  it("finds Diwali two days after a date", () => {
    expect(nearestFestival("2026-11-06")).toEqual({ festival: "diwali", date: "2026-11-08", daysAway: 2 });
  });

  it("reports festivals before the date with a negative distance", () => {
    expect(nearestFestival("2027-01-30")).toEqual({ festival: "republic_day", date: "2027-01-26", daysAway: -4 });
  });

  it("prefers the closest festival and breaks ties by the earlier one", () => {
    expect(nearestFestival("2026-10-14")).toMatchObject({ festival: "navratri", daysAway: -3 });
    expect(nearestFestival("2026-08-21")).toMatchObject({ festival: "onam", daysAway: 5 });
    expect(nearestFestival("2027-03-16")).toMatchObject({ festival: "eid_al_fitr", daysAway: -6 });
    expect(nearestFestival("2026-10-17", 3)).toMatchObject({ festival: "durga_puja", daysAway: 1 });
  });

  it("uses the window and returns null outside it or beyond the table", () => {
    expect(nearestFestival("2026-11-20")).toBeNull();
    expect(nearestFestival("2026-11-12", 3)).toBeNull();
    expect(nearestFestival("2029-10-20")).toBeNull();
  });
});

describe("upcomingDates", () => {
  it("lists a festival's dates from a day onwards", () => {
    expect(upcomingDates("diwali", "2026-11-08")).toEqual(["2026-11-08", "2027-10-29", "2028-10-17"]);
    expect(upcomingDates("diwali", "2028-10-18")).toEqual([]);
  });
});
