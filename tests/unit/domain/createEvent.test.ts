import { describe, expect, it } from "vitest";
import {
  createEventDateIssues,
  createEventRuleIssues,
  createEventSchema,
  functionDateWindow,
  type CreateEventInput,
} from "@/lib/domain/model/createEvent";

const today = "2026-10-28";

function validInput(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    mode: "ai",
    eventType: "wedding",
    title: "",
    occasion: null,
    occasionOther: "",
    milestone: null,
    eventDate: "2026-12-14",
    city: "Pune",
    guestCount: 350,
    budget: 2_500_000,
    functions: [{ name: "Sangeet", date: "2026-12-13", startTime: "19:00", endTime: "23:00", sharePercent: 15 }],
    vibe: "",
    theme: "",
    tradition: ["marathi"],
    traditionOther: "",
    dietary: ["veg"],
    honorees: [{ role: "bride", name: "Ananya", age: 28, gender: null, interests: ["Kathak"], notes: "" }],
    flags: { kids: false, elderly: true, mobility: false },
    language: "en",
    ...overrides,
  };
}

const messages = (input: CreateEventInput) => {
  const parsed = createEventSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("createEventSchema", () => {
  it("accepts a complete request and cleans free text", () => {
    const parsed = createEventSchema.parse(validInput({ city: "  Pune \n", vibe: "Pastel\tand music" }));
    expect(parsed.city).toBe("Pune");
    expect(parsed.vibe).toBe("Pastel and music");
  });

  it.each([
    [{ guestCount: 0 }, "guestCount: Enter between 1 and 5,000 guests."],
    [{ guestCount: Number.NaN }, "guestCount: Enter between 1 and 5,000 guests."],
    [{ budget: 500 }, "budget: Enter between ₹1,000 and ₹10,00,00,000."],
    [{ eventDate: "" }, "eventDate: Pick the event date."],
    [{ city: "P" }, "city: Enter the city."],
    [{ eventType: "birthday", milestone: 121 }, "milestone: Enter a whole number."],
    [{ eventType: "anniversary", milestone: 0 }, "milestone: Enter between 1 and 80 years."],
    [{ milestone: 5 }, "milestone: Only birthdays and anniversaries have a milestone."],
    [{ occasion: "diwali" }, "occasion: Only community and other events have an occasion."],
  ] as const)("rejects %o", (overrides, message) => {
    expect(messages(validInput(overrides as Partial<CreateEventInput>))).toContain(message);
  });

  it("checks each part: name, end after start and the share range", () => {
    const issues = messages(validInput({ functions: [{ name: " ", date: null, startTime: "19:00", endTime: "18:30", sharePercent: 0 }] }));
    expect(issues).toEqual(
      expect.arrayContaining([
        "functions.0.name: Add a name.",
        "functions.0.endTime: End time must be after the start time.",
        "functions.0.sharePercent: Enter a share from 1 to 100%.",
      ]),
    );
  });

  it("rejects unknown keys, too many people and too many traditions", () => {
    expect(createEventSchema.safeParse({ ...validInput(), origin: "ai" }).success).toBe(false);
    const person = validInput().honorees[0];
    expect(messages(validInput({ honorees: [person, person, person, person, person] }))).toContain("honorees: Add up to 4 people.");
    expect(messages(validInput({ tradition: ["marathi", "punjabi", "tamil", "bengali", "sikh", "jain", "parsi"] }))).toContain(
      "tradition: Choose up to 6 traditions.",
    );
  });
});

describe("createEventRuleIssues", () => {
  it("flags shares over 100% and passes valid combinations", () => {
    const part = { name: "A", date: null, startTime: null, endTime: null, sharePercent: 60 };
    expect(createEventRuleIssues({ eventType: "other", milestone: null, occasion: "other", functions: [part, part] })).toEqual([
      { path: ["functions"], message: "Shares add up to more than 100%." },
    ]);
    expect(createEventRuleIssues({ eventType: "birthday", milestone: 6, occasion: null, functions: [part] })).toEqual([]);
  });
});

describe("functionDateWindow and createEventDateIssues", () => {
  it("allows 14 days before to 1 day after, never before today", () => {
    expect(functionDateWindow("2026-12-14", today)).toEqual({ from: "2026-11-30", to: "2026-12-15" });
    expect(functionDateWindow("2026-11-06", today)).toEqual({ from: "2026-10-28", to: "2026-11-07" });
  });

  it("reports an event date outside today to today + 730", () => {
    const message = "Pick a date from today (28 Oct 2026) to 27 Oct 2028.";
    expect(createEventDateIssues(validInput({ eventDate: "2026-10-12" }), today)).toEqual([{ path: ["eventDate"], message }]);
    expect(createEventDateIssues(validInput({ eventDate: "2028-10-28" }), today)).toEqual([{ path: ["eventDate"], message }]);
  });

  it("reports part dates outside the window, and nothing for a malformed event date", () => {
    const parts = [
      { name: "Rangoli", date: "2026-11-08", startTime: null, endTime: null, sharePercent: null },
      { name: "Puja", date: "2026-11-06", startTime: null, endTime: null, sharePercent: null },
    ];
    expect(createEventDateIssues(validInput({ eventDate: "2026-11-06", functions: parts }), today)).toEqual([
      { path: ["functions", 0, "date"], message: "Pick a date from 28 Oct 2026 to 7 Nov 2026." },
    ]);
    expect(createEventDateIssues(validInput({ eventDate: "soon" }), today)).toEqual([]);
  });
});
