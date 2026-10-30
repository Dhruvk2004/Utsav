import { describe, expect, it } from "vitest";
import {
  changeEventType,
  eventDateHelper,
  festivalNote,
  fieldId,
  firstStepWithIssues,
  functionRow,
  honoreeRow,
  newWizardForm,
  orderedEventTypes,
  toCreateEventInput,
  vibePlaceholder,
  wizardIssues,
  type WizardForm,
} from "@/lib/client/eventWizard";

import { createEventSchema } from "@/lib/domain/model/createEvent";
import { STUB_PROFILE } from "../../helpers/stubServices";

const today = "2026-10-28";

function filled(overrides: Partial<WizardForm> = {}): WizardForm {
  return { ...newWizardForm(null), eventDate: "2026-12-14", city: "Pune", guests: "350", budget: "25,00,000", ...overrides };
}

describe("newWizardForm", () => {
  it("pre-fills from the profile and lists the five wedding functions", () => {
    const form = newWizardForm({
      ...STUB_PROFILE,
      homeCity: "Pune",
      traditions: ["marathi", "undisclosed"],
      dietary: ["veg"],
      language: "hi",
      eventTypes: [],
    });
    expect(form).toMatchObject({
      eventType: "wedding",
      city: "Pune",
      tradition: ["marathi"],
      dietary: ["veg"],
      language: "hi",
      hasParts: true,
    });
    expect(form.functions.map((f) => f.name)).toEqual(["Haldi", "Mehndi", "Sangeet", "Wedding", "Reception"]);
  });

  it("uses the URL prefill, then the profile's first event type", () => {
    expect(newWizardForm({ ...STUB_PROFILE, eventTypes: ["birthday"] }).eventType).toBe("birthday");
    const diwali = newWizardForm(null, { eventType: "community", occasion: "diwali" });
    expect(diwali).toMatchObject({ eventType: "community", occasion: "diwali", hasParts: false, functions: [] });
    expect(newWizardForm(null, { eventType: "wedding", occasion: "diwali" }).occasion).toBe("");
  });
});

describe("changeEventType", () => {
  it("resets type-specific fields and keeps the rest", () => {
    const form = filled({ milestone: "6" });
    const next = changeEventType(form, "community");
    expect(next).toMatchObject({ eventType: "community", milestone: "", hasParts: false, functions: [], city: "Pune" });
    expect(changeEventType(next, "community")).toBe(next);
  });

  it("orders event types with the profile's first", () => {
    expect(orderedEventTypes(["community", "birthday"])).toEqual(["community", "birthday", "wedding", "anniversary", "other"]);
  });
});

describe("toCreateEventInput", () => {
  it("produces a request the shared schema accepts", () => {
    const form = filled({
      tradition: ["mixed_other"],
      traditionOther: "Konkani",
      honorees: [{ ...honoreeRow("wedding"), age: "28", gender: "female" }],
    });
    const parsed = createEventSchema.parse(toCreateEventInput(form, "blank"));
    expect(parsed).toMatchObject({ mode: "blank", guestCount: 350, budget: 2_500_000, traditionOther: "Konkani" });
    expect(parsed.functions).toHaveLength(5);
    expect(parsed.honorees[0]).toMatchObject({ role: "guest_of_honour", age: 28, gender: "female" });
  });

  it("drops fields that do not belong to the type", () => {
    const birthday = toCreateEventInput(filled({ eventType: "birthday", milestone: "6", occasion: "diwali", hasParts: false }), "ai");
    expect(birthday).toMatchObject({ milestone: 6, occasion: null, functions: [] });
    const other = toCreateEventInput(
      filled({ eventType: "other", occasion: "other", occasionOther: "Foundation day", milestone: "6" }),
      "ai",
    );
    expect(other).toMatchObject({ occasion: "other", occasionOther: "Foundation day", milestone: null });
    const community = toCreateEventInput(
      filled({ eventType: "community", occasion: "diwali", occasionOther: "x", tradition: ["tamil"], traditionOther: "y" }),
      "ai",
    );
    expect(community).toMatchObject({ occasionOther: "", traditionOther: "" });
    expect(toCreateEventInput(filled({ eventType: "community", occasion: "" }), "ai").occasion).toBeNull();
    expect(toCreateEventInput(filled({ guests: " ", budget: "" }), "ai")).toMatchObject({ guestCount: Number.NaN, budget: Number.NaN });
  });

  it("picks a sensible role for a new person", () => {
    expect(honoreeRow("birthday").role).toBe("birthday_child");
    expect(honoreeRow("community").role).toBe("community");
    expect(honoreeRow("anniversary").role).toBe("couple");
    expect(functionRow("Puja").name).toBe("Puja");
    expect(functionRow().key).not.toBe(functionRow().key);
  });
});

describe("wizardIssues", () => {
  it("reports only the step's own fields, with ids and labels for the summary", () => {
    const form = filled({
      eventType: "community",
      guests: "",
      budget: "500",
      functions: [{ ...functionRow(""), endTime: "10:00", startTime: "12:00" }],
    });
    expect(wizardIssues(form, today, 1)).toEqual([
      { id: "event-guestCount", label: "Guests", message: "Enter between 1 and 5,000 guests." },
      { id: "event-budget", label: "Total budget", message: "Enter between ₹1,000 and ₹10,00,00,000." },
    ]);
    expect(wizardIssues(form, today, 2)).toEqual([
      { id: "event-functions-0-name", label: "Part 1 name", message: "Add a name." },
      { id: "event-functions-0-endTime", label: "Part 1 end time", message: "End time must be after the start time." },
    ]);
    expect(wizardIssues(form, today, 3)).toEqual([]);
    expect(firstStepWithIssues(form, today)).toBe(1);
    expect(firstStepWithIssues(filled(), today)).toBeNull();
  });

  it("labels milestone, part, person and cross-field problems", () => {
    const form = filled({
      eventType: "birthday",
      milestone: "130",
      hasParts: true,
      functions: [
        { ...functionRow("Cake"), share: "70", date: "2027-01-01" },
        { ...functionRow("Games"), share: "40" },
      ],
      honorees: [{ ...honoreeRow("birthday"), age: "200" }],
    });
    const all = wizardIssues(form, today);
    expect(all).toEqual(
      expect.arrayContaining([
        { id: "event-milestone", label: "Turning (age)", message: "Enter a whole number." },
        { id: "event-functions", label: "Shares", message: "Shares add up to more than 100%." },
        { id: "event-functions-0-date", label: "Cake date", message: "Pick a date from 30 Nov 2026 to 15 Dec 2026." },
        { id: "event-honorees-0-age", label: "Person 1 age", message: "Enter an age from 0 to 120." },
      ]),
    );
    const anniversary = wizardIssues(filled({ eventType: "anniversary", milestone: "90" }), today, 1);
    expect(anniversary[0]).toMatchObject({ label: "Years married" });
  });

  it("builds ids from schema paths", () => {
    expect(fieldId(["functions", 2, "date"])).toBe("event-functions-2-date");
  });
});

describe("helpers", () => {
  it("describes the event date", () => {
    expect(eventDateHelper("2026-12-14", today)).toBe("Monday · 47 days from today");
    expect(eventDateHelper("2026-10-28", today)).toBe("Wednesday · today");
    expect(eventDateHelper("2026-10-29", today)).toBe("Thursday · tomorrow");
    expect(eventDateHelper("2026-10-20", today)).toBe("Tuesday · 8 days ago");
    expect(eventDateHelper("", today)).toBeNull();
  });

  it("places the chosen festival relative to the date", () => {
    expect(festivalNote("diwali", "2026-11-06")).toBe("Diwali is on Sun 8 Nov 2026, 2 days after your date.");
    expect(festivalNote("diwali", "2026-11-09")).toBe("Diwali is on Sun 8 Nov 2026, 1 day before your date.");
    expect(festivalNote("christmas", "2026-12-25")).toBe("Christmas is on Fri 25 Dec 2026, the same day as your date.");
    expect(festivalNote("eid", "2027-03-12")).toBe("Eid al-Fitr is on Wed 10 Mar 2027, 2 days before your date.");
    expect(festivalNote("diwali", "2026-12-25")).toBeNull();
    expect(festivalNote("housewarming", "2026-11-06")).toBeNull();
    expect(festivalNote("", "2026-11-06")).toBeNull();
    expect(festivalNote("diwali", "")).toBeNull();
  });

  it("suggests a vibe by type", () => {
    expect(vibePlaceholder("community")).toBe("Bright, family-friendly, lots of lights");
  });
});
