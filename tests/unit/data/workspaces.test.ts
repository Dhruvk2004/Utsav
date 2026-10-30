import { describe, expect, it } from "vitest";
import { AiRequestError, RecordedAiClient } from "@/lib/data/aiClient";

import { demoWorkspace } from "@/lib/demo/session";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { TODAY, wedding } from "../../domainFixtures";
import { InMemoryEventsRepository, StubWorkspaceRepository, starterPlan, stubEventSummaries, stubPlan } from "../../helpers/stubServices";

const NOW = "2026-10-28T06:00:00.000Z";
const summaries = () => stubEventSummaries(TODAY);

describe("stub workspace plans", () => {
  it("backs every stub card with a valid plan", () => {
    for (const summary of summaries()) {
      const plan = stubPlan(summary, TODAY);
      expect(planInvariantViolations(plan)).toEqual([]);
      expect(plan.details.eventDate).toBe(summary.details.eventDate);
    }
    const [weddingCard, birthdayCard, anniversary] = summaries();
    expect(stubPlan(weddingCard, TODAY).details.title).toBe("Ananya & Rohan's wedding");
    expect(stubPlan(birthdayCard, TODAY)).toMatchObject({ review: { budget: "reviewed", ideas: "pending" } });
    expect(stubPlan(birthdayCard, TODAY).ideas.every((idea) => idea.state === "suggested")).toBe(true);
    expect(stubPlan(anniversary, TODAY)).toMatchObject({ source: "template", review: null, summary: { origin: "code" } });
  });

  it("starts new AI events from the template, under review", () => {
    const plan = starterPlan({ ...summaries()[2], id: "new-event-1", source: "ai" }, TODAY);
    expect(plan.review).toEqual({ budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" });
    expect(plan.tasks.every((task) => task.origin === "ai")).toBe(true);
    expect(planInvariantViolations(plan)).toEqual([]);
  });
});

describe("StubWorkspaceRepository", () => {
  it("opens known events once per page load and returns null for unknown ones", async () => {
    const repo = new StubWorkspaceRepository(new InMemoryEventsRepository(summaries), () => TODAY);
    const first = await repo.open("stub-wedding");
    expect(first?.store.mode).toBe("server");
    expect(first?.review).toBe(first?.store);
    expect(await repo.open("stub-wedding")).toBe(first);
    expect(await repo.open("nope")).toBeNull();
    const proposal = await first!.createProposal({
      touchpoint: "reset",
      origin: "code",
      instruction: "",
      items: [{ op: { type: "reset_section", section: "ideas" } }],
    });
    expect(proposal.items[0].status).toBe("pending");
  });
});

describe("RecordedAiClient", () => {
  const plan = wedding();
  const client = new RecordedAiClient(
    "wedding",
    () => plan,
    TODAY,
    0,
    () => NOW,
  );

  it("answers instruct and ideas from recordings, dry-run against the plan", async () => {
    const instruct = await client.instruct({ instruction: "make that 15% instead", tab: "budget", previousTurns: [] });
    expect(instruct).toMatchObject({
      recorded: true,
      proposal: { touchpoint: "instruct", instruction: "make that 15% instead", createdAt: NOW },
    });
    const ideas = await client.ideas({ focus: [], instruction: "" });
    expect(ideas.proposal.items).toHaveLength(3);
  });

  it("re-plans the wedding budget smartly with trade-offs, and is unavailable elsewhere", async () => {
    const smart = await client.whatif({ newTotal: 2_200_000, protect: ["line-catering"], instruction: "" });
    expect(smart.rows.reduce((sum, row) => sum + row.after, 0)).toBe(2_200_000);
    expect(smart.ignored).toEqual(["Fireworks"]);
    expect(smart.tradeoffs.items.map((item) => item.op.type)).toEqual(["add_idea", "add_task"]);
    const birthdayClient = new RecordedAiClient("birthday", () => plan, TODAY, 0);
    await expect(birthdayClient.whatif({ newTotal: 50_000, protect: [], instruction: "" })).rejects.toBeInstanceOf(AiRequestError);
  });

  it("drafts template enquiries for a vendor in the plan", async () => {
    const draft = await client.enquiry("vendor-photographer", {
      channel: "whatsapp",
      language: "en",
      tone: "warm",
      includeBudget: false,
      questions: [],
    });
    expect(draft).toMatchObject({ origin: "template", subject: "" });
    await expect(
      client.enquiry("nope", { channel: "email", language: "en", tone: "warm", includeBudget: false, questions: [] }),
    ).rejects.toMatchObject({ kind: "unavailable", retryAfterMinutes: 0 });
  });

  it("stops when the request is cancelled", async () => {
    const slow = new RecordedAiClient("wedding", () => plan, TODAY, 50);
    const controller = new AbortController();
    const pending = slow.instruct({ instruction: "x", tab: "overview", previousTurns: [] }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("demo session", () => {
  it("is a sandbox over the pristine sample with no review controls", () => {
    const session = demoWorkspace("community", TODAY);
    expect(session.store.mode).toBe("sandbox");
    expect(session.review).toBeNull();
    expect(session.store.getPlan().details.occasion).toBe("diwali");
  });
});
