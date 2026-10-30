import { describe, expect, it } from "vitest";
import { ideasDraft, libraryDraft } from "@/lib/ai/ideas";
import { instructDraft } from "@/lib/ai/instruct";
import { enquiryText } from "@/lib/ai/enquiry";
import { demoFixture } from "@/lib/demo/fixtures";
import type { EventDoc } from "@/lib/domain/model/event";
import { buildProposal } from "@/lib/plan/proposals";
import { INSTRUCT_CASES } from "../../fixtures/aiEval";
import { TODAY, wedding } from "../../domainFixtures";
import { fakeModel } from "../../helpers/fakeModel";

const CLOCK = { today: TODAY, now: "2026-10-28T06:00:00.000Z" };

describe("AI mode eval set with the fake model (spec 6.3)", () => {
  it.each(INSTRUCT_CASES.map((c) => [c.instruction, c] as const))("%s", async (instruction, testCase) => {
    const plan = wedding();
    const draft = await instructDraft(
      fakeModel({ tools: [testCase.calls] }),
      plan,
      { instruction, tab: "budget", previousTurns: [] },
      TODAY,
    );
    expect(draft.items.map((item) => item.op.type)).toEqual(testCase.expect.types);
    if (testCase.expect.reply) expect(draft.reply).toMatch(testCase.expect.reply);
    // Every card the eval expects is valid against the plan (the booked venue cannot be removed by AI).
    const proposal = buildProposal(plan, draft, CLOCK);
    const valid = proposal.items.filter((item) => item.status === "pending").length;
    expect(valid).toBe(instruction.startsWith("Ignore") ? 0 : testCase.expect.types.length);
  });
});

/** Personalisation (spec 7.1, 7.2): a girl who loves cartoons, and a Diwali community event. */
const birthdayGirl = () => demoFixture("birthday", TODAY);
const diwali = () => demoFixture("community", TODAY);

function freshIdeas(plan: EventDoc): EventDoc {
  return { ...plan, ideas: [], dismissedIdeaTitles: [] };
}

describe("ideas eval personas", () => {
  it("sends a 6-year-old's age, gender and cartoon interests, and the Jain diet, never her name", async () => {
    const { event, profile } = birthdayGirl();
    const model = fakeModel({
      json: [
        {
          ideas: [
            {
              title: "Peppa Pig character decor",
              description: "Cartoon decor",
              category: "decor",
              estimatedCost: 8000,
              costBasis: "per event",
              basis: ["honoree.interests:Peppa Pig", "honoree.age"],
              effort: "mixed",
            },
          ],
        },
      ],
    });
    const draft = await ideasDraft(model, event, profile, { focus: [], instruction: "" }, TODAY);
    const prompt = model.prompts[0];
    for (const input of ['"age": 6', '"gender": "female"', "Peppa Pig", "cartoons", '"jain"', '"ageBand": "6-9"'])
      expect(prompt).toContain(input);
    expect(prompt).not.toContain(event.honorees[0].name || "Birthday girl's name");
    expect(draft.items[0].op).toMatchObject({ idea: { basis: ["honoree.interests:Peppa Pig", "honoree.age"] } });
  });

  it("without AI, the library still suggests cartoon decor and a painting station for her", () => {
    const titles = (libraryDraft(freshIdeas(birthdayGirl().event), { focus: [], instruction: "" })?.items ?? []).map((i) =>
      i.op.type === "add_idea" ? i.op.idea.title : "",
    );
    expect(titles[0]).toBe("Cartoon-character decor and cake");
    expect(titles).toContain("Kids' painting station with aprons");
    expect(titles.join(" ")).not.toMatch(/princess/i);
  });

  it("sends Diwali, the festival nearby and the community role; the library offers rangoli", async () => {
    const { event, profile } = diwali();
    const model = fakeModel({
      json: [
        {
          ideas: [
            {
              title: "Rangoli for teens",
              description: "d",
              category: "activity",
              estimatedCost: null,
              costBasis: "per event",
              basis: ["details.occasion:diwali"],
              effort: "diy",
            },
          ],
        },
      ],
    });
    await ideasDraft(model, event, profile, { focus: [], instruction: "" }, TODAY);
    for (const input of ['"occasion": "diwali"', '"festival": "diwali"', '"role": "community"', "Residents from many states"])
      expect(model.prompts[0]).toContain(input);
    const ideas = (libraryDraft(freshIdeas(event), { focus: [], instruction: "" })?.items ?? []).flatMap((i) =>
      i.op.type === "add_idea" ? [i.op.idea] : [],
    );
    expect(ideas.slice(0, 4).every((idea) => idea.basis.includes("details.occasion:diwali"))).toBe(true);
    expect(ideas.map((idea) => idea.title)).toContain("Rangoli competition by age group");
  });
});

describe("enquiry eval (spec 6.6)", () => {
  it("never invents a vendor name: the greeting is the placeholder and contact details are stripped", async () => {
    const plan = wedding();
    const model = fakeModel({
      json: [{ subject: "Enquiry", body: "Dear Sharma Caterers, please call 98200 12345 or mail us at a@b.in.", placeholders: [] }],
    });
    const text = await enquiryText(model, plan, plan.vendors[1], {
      channel: "email",
      language: "en",
      tone: "formal",
      includeBudget: false,
      questions: [],
    });
    expect(text.body).toMatch(/^Hi \[Vendor name\],/);
    expect(text.body).not.toMatch(/Sharma|98200|a@b\.in/);
  });
});
