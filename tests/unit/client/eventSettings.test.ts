import { describe, expect, it } from "vitest";
import { datePreview, datePreviewText, detailsFormOf, detailsIssues, detailsOp } from "@/lib/client/eventSettings";
import { TODAY, wedding } from "../../domainFixtures";

describe("event settings form (spec 5.9)", () => {
  it("starts from the plan's details", () => {
    expect(detailsFormOf(wedding())).toEqual({
      title: "Marathi-Punjabi wedding",
      eventDate: "2026-12-27",
      city: expect.any(String),
      language: "en",
    });
  });

  it("flags a long name, a missing city and a bad or past date", () => {
    const form = detailsFormOf(wedding());
    expect(detailsIssues(form, TODAY)).toEqual({});
    expect(detailsIssues({ ...form, title: "x".repeat(81), city: "  ", eventDate: "27/12/2026" }, TODAY)).toEqual({
      title: expect.any(String),
      city: "Add the city.",
      eventDate: "Pick a date.",
    });
    expect(detailsIssues({ ...form, eventDate: "2026-01-01" }, TODAY).eventDate).toMatch(/\.$/);
  });

  it("saves only the changed fields, trimmed, or nothing", () => {
    const plan = wedding();
    const form = detailsFormOf(plan);
    expect(detailsOp(plan, form)).toBeNull();
    expect(detailsOp(plan, { ...form, title: "  Our wedding ", city: ` ${form.city} ` })).toEqual({
      type: "set_details",
      title: "Our wedding",
    });
  });
});

describe("date-change preview", () => {
  it("is null for the same or an incomplete date", () => {
    const plan = wedding();
    expect(datePreview(plan, plan.details.eventDate, TODAY)).toBeNull();
    expect(datePreview(plan, "2027-01", TODAY)).toBeNull();
  });

  it("counts moved tasks and shifted functions by dry-running the save", () => {
    const plan = wedding();
    const later = datePreview(plan, "2027-01-03", TODAY)!;
    expect(later).toMatchObject({ shift: 7, functionsShifted: plan.functions.length, problem: null });
    expect(later.tasksMoved).toBeGreaterThan(0);
    expect(datePreviewText(later, "2027-01-03")).toMatch(
      /^Moves the event 7 days later to .+: \d+ tasks? move, 5 functions shift by the same 7 days\.$/,
    );
  });

  it("reports newly rushed tasks when the event comes sooner, and singulars for one day", () => {
    const plan = wedding();
    const sooner = datePreview(plan, "2026-11-08", TODAY)!;
    expect(sooner.shift).toBeLessThan(0);
    expect(sooner.newlyRushed).toBeGreaterThan(0);
    expect(datePreviewText(sooner, "2026-11-08")).toMatch(/earlier .*become rushed/);
    expect(datePreviewText({ shift: 1, tasksMoved: 1, newlyRushed: 0, functionsShifted: 0, problem: null }, "2026-12-28")).toMatch(
      /^Moves the event 1 day later to .+: 1 task move\.$/,
    );
  });

  it("shows why a date cannot be used", () => {
    const preview = datePreview(wedding(), "2020-01-01", TODAY)!;
    expect(preview.problem).toEqual(expect.any(String));
    expect(datePreviewText(preview, "2020-01-01")).toBe(preview.problem);
  });
});
