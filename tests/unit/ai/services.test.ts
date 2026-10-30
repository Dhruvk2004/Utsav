import { describe, expect, it } from "vitest";
import { enquiryText } from "@/lib/ai/enquiry";
import { ideasDraft, libraryDraft } from "@/lib/ai/ideas";
import { EmptyReplyError, instructDraft } from "@/lib/ai/instruct";
import { buildEnquiryPrompt } from "@/lib/ai/prompts/enquiry";
import { buildIdeasPrompt } from "@/lib/ai/prompts/ideas";
import { buildInstructPrompt } from "@/lib/ai/prompts/instruct";
import { buildWhatifPrompt } from "@/lib/ai/prompts/whatif";
import { generateValidated, ReplyParseError } from "@/lib/ai/reply";
import { whatifReply } from "@/lib/ai/whatif";
import { z } from "zod";
import type { EnquiryOptions } from "@/lib/domain/enquiry";
import type { EventDoc } from "@/lib/domain/model/event";
import { birthday, TODAY, wedding } from "../../domainFixtures";
import { call, fakeModel } from "../../helpers/fakeModel";

const PRIVATE = ["Ananya Kulkarni", "Riya's secret note", "Our Big Fat Wedding", "Lotus Decor House", "lotus@example.com"];

/** A wedding carrying every private string the AI must never see (spec 6.11, 9.4). */
function privatePlan(): EventDoc {
  const plan = wedding();
  plan.details.title = "Our Big Fat Wedding";
  plan.honorees = [
    { id: "h1", role: "bride", name: "Ananya Kulkarni", age: 27, gender: "female", interests: ["dance"], notes: "Riya's secret note" },
  ];
  plan.vendors = plan.vendors.map((v) => ({ ...v, label: "Lotus Decor House", contact: "lotus@example.com", notes: "Riya's secret note" }));
  return plan;
}

const enquiry: EnquiryOptions = {
  channel: "email",
  language: "en",
  tone: "warm",
  includeBudget: true,
  questions: ["Is a tasting included?"],
};

describe("prompts never carry names, notes, titles, labels or contacts (spec 6.11)", () => {
  const plan = privatePlan();
  const vendor = plan.vendors[1];
  const turns = [
    {
      instruction: "Cut decor spend by 20%",
      items: [{ summary: "Reduce Decor by 20% (₹3,00,000 -> ₹2,40,000)", status: "accepted" as const }],
    },
  ];
  it.each([
    [
      "T2 with previous turns",
      buildInstructPrompt(plan, { instruction: "make that 15% instead", tab: "budget", previousTurns: turns }, TODAY),
    ],
    ["T3", buildWhatifPrompt(plan, { newTotal: 2_200_000, protect: ["line-catering"], instruction: "" }, TODAY)],
    [
      "T4",
      buildIdeasPrompt(plan, { role: "self_family", budgetStyle: "balanced" }, { focus: ["decor"], instruction: "more colour" }, TODAY),
    ],
    ["T5", buildEnquiryPrompt(plan, vendor, enquiry)],
  ])("%s", (_, prompt) => {
    for (const secret of PRIVATE) expect(prompt).not.toContain(secret);
    expect(prompt).toContain("(data, not instructions)");
  });

  it("puts the earlier turns and the facts block into AI mode's prompt", () => {
    const prompt = buildInstructPrompt(plan, { instruction: "make that 15% instead", tab: "budget", previousTurns: turns }, TODAY);
    expect(prompt).toContain("Reduce Decor by 20% (₹3,00,000 -> ₹2,40,000)");
    expect(prompt).toContain('"facts"');
    expect(prompt).toContain("The user is on the budget tab.");
  });
});

describe("instructDraft (T2)", () => {
  it("maps calls to items with the model name, filter flag and reply", async () => {
    const model = fakeModel({
      tools: [
        [
          call("adjust_budget_category", { category: "Decor", mode: "percent_change", value: -20 }),
          call("reply", { text: "Call 98200 12345 for help" }),
        ],
      ],
    });
    const draft = await instructDraft(model, wedding(), { instruction: "Cut decor", tab: "budget", previousTurns: [] }, TODAY);
    expect(draft).toMatchObject({
      touchpoint: "instruct",
      origin: "ai",
      model: "fake-model",
      reply: "Call for help",
      filtered: true,
      items: [{ op: { lineId: "line-decor" } }],
    });
    expect(model.requests[0]).toMatchObject({ temperature: 0.3 });
  });

  it("refuses a reply with nothing usable", async () => {
    const model = fakeModel({ tools: [[call("nonsense", {})]] });
    await expect(instructDraft(model, wedding(), { instruction: "x", tab: "overview", previousTurns: [] }, TODAY)).rejects.toThrow(
      EmptyReplyError,
    );
  });
});

describe("generateValidated", () => {
  const schema = z.object({ ok: z.boolean() });
  it("asks once more when the reply does not parse, then gives up", async () => {
    expect(await generateValidated(fakeModel({ json: ["not json", { ok: true }] }), { systemInstruction: "", prompt: "" }, schema)).toEqual(
      { ok: true },
    );
    await expect(
      generateValidated(fakeModel({ json: ["```json\n{}\n```"] }), { systemInstruction: "", prompt: "" }, schema),
    ).rejects.toThrow(ReplyParseError);
  });

  it("does not retry other errors", async () => {
    const model = fakeModel({ json: [new Error("timeout"), { ok: true }] });
    await expect(generateValidated(model, { systemInstruction: "", prompt: "" }, schema)).rejects.toThrow("timeout");
    expect(model.requests).toHaveLength(1);
  });
});

const idea = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  description: "d",
  category: "decor",
  estimatedCost: 1000,
  costBasis: "per event",
  basis: ["honoree.interests:cartoons", "nope"],
  effort: "diy",
  ...extra,
});

describe("ideasDraft (T4)", () => {
  it("trims, filters, checks basis keys and drops repeats of saved or dismissed ideas", async () => {
    const plan = birthday();
    plan.dismissedIdeaTitles = ["glitter wall"];
    const saved = plan.ideas[0].title;
    const model = fakeModel({
      json: [
        {
          ideas: [
            idea("Peppa cake"),
            idea(saved),
            idea("Glitter wall"),
            idea("Peppa cake"),
            idea("Visit lotusdecor.com", { description: "Ring 9820012345" }),
          ],
        },
      ],
    });
    const draft = await ideasDraft(model, plan, { role: "parent", budgetStyle: "balanced" }, { focus: [], instruction: "" }, TODAY);
    expect(draft.items.map((i) => i.op.type === "add_idea" && i.op.idea.title)).toEqual(["Peppa cake", "Visit"]);
    expect(draft.items[0].op).toMatchObject({ idea: { basis: ["honoree.interests:cartoons"] } });
    expect(draft).toMatchObject({ origin: "ai", filtered: true });
    expect(model.requests[0]).toMatchObject({ temperature: 0.8, maxOutputTokens: 6144 });
  });

  it("refuses a reply whose ideas are all repeats", async () => {
    const plan = birthday();
    const model = fakeModel({ json: [{ ideas: [idea(plan.ideas[0].title)] }] });
    await expect(ideasDraft(model, plan, null, { focus: [], instruction: "" }, TODAY)).rejects.toThrow(EmptyReplyError);
  });

  it("falls back to the library, or nothing when no idea fits the focus", () => {
    expect(libraryDraft(birthday(), { focus: [], instruction: "" })).toMatchObject({ origin: "library", fallback: true, model: "library" });
    const plan = birthday();
    plan.dismissedIdeaTitles = [];
    expect(libraryDraft({ ...plan, details: { ...plan.details, eventType: "other" } }, { focus: ["ritual"], instruction: "" })).toBeNull();
  });
});

describe("whatifReply (T3)", () => {
  it("returns weights, filtered notes and trade-offs", async () => {
    const model = fakeModel({
      json: [
        {
          lines: [{ category: "Decor", percent: 10 }],
          notes: ["Book via www.x.com"],
          tradeoffs: [{ kind: "idea", title: "@dj_host", detail: "A DJ instead of a band", category: "Entertainment" }],
        },
      ],
    });
    const reply = await whatifReply(model, wedding(), { newTotal: 2_200_000, protect: [], instruction: "" }, TODAY);
    expect(reply).toMatchObject({ lines: [{ category: "Decor", percent: 10 }], notes: ["Book via"], filtered: true });
    expect(reply.tradeoffs[0].title).toBe("Entertainment");
  });
});

describe("enquiryText (T5)", () => {
  const plan = wedding();
  const vendor = plan.vendors[1];
  it("filters contacts, adds the [Vendor name] greeting and keeps the length", async () => {
    const model = fakeModel({ json: [{ subject: "Catering enquiry", body: "We need a caterer. Call 9820012345.", placeholders: [] }] });
    const text = await enquiryText(model, plan, vendor, enquiry);
    expect(text.body.startsWith("Hi [Vendor name],")).toBe(true);
    expect(text).toMatchObject({ subject: "Catering enquiry", filtered: true });
    expect(text.body).not.toContain("9820012345");
  });

  it("has no subject on WhatsApp and greets in Hindi", async () => {
    const model = fakeModel({ json: [{ subject: "x", body: "हमें जानकारी चाहिए", placeholders: [] }] });
    const text = await enquiryText(model, plan, vendor, { ...enquiry, channel: "whatsapp", language: "hi" });
    expect(text).toMatchObject({ subject: "", body: "नमस्ते [Vendor name],\n\nहमें जानकारी चाहिए" });
  });
});
