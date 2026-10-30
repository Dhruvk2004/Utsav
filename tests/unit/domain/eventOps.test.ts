import { describe, expect, it } from "vitest";
import { demoFixture } from "@/lib/demo/fixtures";
import type { HonoreeDoc } from "@/lib/domain/model/event";
import { AI, applyOk, birthday, rejectReason, TODAY, wedding } from "../../domainFixtures";

describe("set_guests", () => {
  it("sets counts and derives the kids and elderly flags from them (invariant 12)", () => {
    let plan = applyOk(birthday(), { type: "set_guests", guests: { total: 45, adults: 15, kids: 30, elderly: 3 } });
    expect(plan.guests).toMatchObject({ total: 45, kids: 30, elderly: 3 });
    expect(plan.flags).toMatchObject({ kids: true, elderly: true });
    plan = applyOk(plan, { type: "set_guests", guests: { adults: 45, kids: 0, elderly: 0 } });
    expect(plan.flags).toMatchObject({ kids: false, elderly: false });
  });

  it.each([
    [{ kids: 50 }, /Kids can't be more than the 40 guests/],
    [{ jain: 41 }, /Jain guests can't be more/],
    [{ adults: 20 }, /Adults and kids should add up to 40/],
  ])("rejects %o", (guests, reason) => {
    expect(rejectReason(birthday(), { type: "set_guests", guests })).toMatch(reason);
  });
});

describe("set_personalisation", () => {
  it("updates honorees, details and the mobility flag", () => {
    const plan = applyOk(birthday(), {
      type: "set_personalisation",
      honorees: [{ id: "h1", role: "birthday_child", name: "", age: 6, gender: null, interests: ["dinosaurs"], notes: "" }],
      flags: { mobility: true },
      theme: "Dinosaurs",
      dietary: ["jain", "nut_allergy"],
    });
    expect(plan.honorees[0].interests).toEqual(["dinosaurs"]);
    expect(plan.flags.mobility).toBe(true);
    expect(plan.details).toMatchObject({ theme: "Dinosaurs", dietary: ["jain", "nut_allergy"], vibe: "Bright, playful, lots of colour" });
  });

  it("rejects toggles that contradict the counts, and duplicate people", () => {
    expect(rejectReason(birthday(), { type: "set_personalisation", flags: { kids: false } })).toMatch(/Kids are counted/);
    expect(rejectReason(wedding(), { type: "set_personalisation", flags: { elderly: false } })).toMatch(/Elderly guests are counted/);
    applyOk(birthday(), { type: "set_personalisation", flags: { kids: true } });
    const person: HonoreeDoc = { id: "h1", role: "couple", name: "", age: null, gender: null, interests: [], notes: "" };
    expect(rejectReason(birthday(), { type: "set_personalisation", honorees: [person, person] })).toMatch(/own entry/);
  });

  it("lets the toggles decide while counts are unset", () => {
    const plan = birthday();
    const { event } = demoFixture("birthday", TODAY);
    expect(event.guests.elderly).toBeNull();
    expect(applyOk(plan, { type: "set_personalisation", flags: { elderly: true } }).flags.elderly).toBe(true);
  });
});

describe("set_details", () => {
  it("updates basics", () => {
    const plan = applyOk(birthday(), { type: "set_details", title: "Party", city: "Mysuru", language: "hi", milestone: 7 });
    expect(plan.details).toMatchObject({ title: "Party", city: "Mysuru", language: "hi", milestone: 7 });
  });

  it("moves the event date with its functions and re-anchors pinned tasks", () => {
    let plan = applyOk(wedding(), { type: "update_task", taskId: "task-book-decorator", date: "2026-11-15" });
    plan = applyOk(plan, { type: "add_task", title: "Thank-you lunch", category: "Guests", date: "2027-01-03" });
    plan = applyOk(plan, { type: "set_details", eventDate: "2026-12-20" }, AI);
    expect(plan.functions.map((f) => f.date)).toEqual(["2026-12-18", "2026-12-18", "2026-12-19", "2026-12-20", "2026-12-21"]);
    expect(plan.tasks.find((t) => t.id === "task-book-decorator")).toMatchObject({ pinnedDate: "2026-11-15", daysBefore: 35 });
    expect(plan.tasks.find((t) => t.id === "task-thank-you-lunch")).toMatchObject({ pinnedDate: null, daysBefore: -7 });
  });

  it("re-anchors a pin that falls more than two years before the new date", () => {
    let plan = applyOk(wedding(), { type: "update_task", taskId: "task-book-decorator", date: "2026-11-15" });
    plan = applyOk(plan, { type: "set_details", eventDate: "2029-01-10" }, { today: "2027-03-01", actor: "user" });
    expect(plan.tasks.find((t) => t.id === "task-book-decorator")).toMatchObject({ pinnedDate: null, daysBefore: 730 });
  });

  it("keeps the same date as a no-op", () => {
    expect(applyOk(wedding(), { type: "set_details", eventDate: "2026-12-27" }).functions[0].date).toBe("2026-12-25");
  });

  it.each([
    [{ eventDate: "2026-10-01" }, /in the past/],
    [{ eventDate: "2026-10-29" }, /move Haldi into the past/],
    [{ occasion: "diwali" }, /community and other events/],
    [{ milestone: 25 }, /birthdays and anniversaries/],
  ] as const)("rejects %o on the wedding", (fields, reason) => {
    expect(rejectReason(wedding(), { type: "set_details", ...fields })).toMatch(reason);
  });

  it("checks anniversary years and allows clearing a milestone", () => {
    const plan = birthday();
    plan.details.eventType = "anniversary";
    plan.details.milestone = null;
    expect(rejectReason(plan, { type: "set_details", milestone: 90 })).toMatch(/between 1 and 80/);
    expect(applyOk(plan, { type: "set_details", milestone: 60 }).details.milestone).toBe(60);
    expect(applyOk(wedding(), { type: "set_details", milestone: null, occasion: null }).details.milestone).toBeNull();
  });

  it("lets AI change only the date", () => {
    expect(rejectReason(wedding(), { type: "set_details", city: "Mumbai" }, AI)).toMatch(/Only the event date/);
  });
});

describe("set_summary", () => {
  it("writes the summary with its origin", () => {
    expect(applyOk(wedding(), { type: "set_summary", text: "Our plan" }).summary).toEqual({ text: "Our plan", origin: "user" });
  });
});
