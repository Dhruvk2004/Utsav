import { describe, expect, it } from "vitest";
import { eventDocSchema } from "@/lib/domain/model/event";
import { decisionSchema, demoUsageSchema, historySchema, proposalSchema, shareDocSchema } from "@/lib/domain/model/records";
import { userDocSchema } from "@/lib/domain/model/user";
import { isProposable, planOperationSchema, PROPOSABLE_OP_TYPES, proposableOperationSchema } from "@/lib/domain/ops/schema";
import { wedding } from "../../domainFixtures";

const stamp = "2026-10-28T06:00:00.000Z";
const idea = {
  title: "Puppet show",
  description: "Kathputli artists greet guests.",
  category: "entertainment",
  estimatedCost: 25_000,
  costBasis: "per event",
  basis: ["details.tradition"],
  effort: "vendor",
};

describe("eventDocSchema", () => {
  it("accepts a complete event", () => {
    expect(eventDocSchema.safeParse(wedding()).success).toBe(true);
  });

  it.each([
    ["a malformed time", (e: ReturnType<typeof wedding>) => (e.functions[0].startTime = "7pm")],
    ["a task too far after the event", (e: ReturnType<typeof wedding>) => (e.tasks[0].daysBefore = -8)],
    ["an unknown vendor status", (e: ReturnType<typeof wedding>) => Object.assign(e.vendors[0], { status: "maybe" })],
    [
      "a missing stats key",
      (e: ReturnType<typeof wedding>) => delete (e.stats.vendorsByStatus as Partial<typeof e.stats.vendorsByStatus>).paid,
    ],
    ["a non-ISO timestamp", (e: ReturnType<typeof wedding>) => (e.createdAt = "yesterday")],
  ])("rejects %s", (_, mutate) => {
    const event = wedding();
    mutate(event);
    expect(eventDocSchema.safeParse(event).success).toBe(false);
  });
});

describe("userDocSchema", () => {
  const user = {
    displayName: "Ananya",
    photoURL: null,
    email: "a@example.com",
    homeCity: "Pune",
    language: "en",
    role: "self_family",
    eventTypes: ["wedding"],
    traditions: ["marathi", "punjabi"],
    traditionOther: "",
    dietary: ["veg"],
    budgetStyle: "balanced",
    detailLevel: "everything",
    onboardedAt: stamp,
    aiUsage: { day: "2026-10-28", count: 3 },
    createdAt: stamp,
    updatedAt: stamp,
  };

  it("accepts a profile and rejects unknown traditions", () => {
    expect(userDocSchema.safeParse(user).success).toBe(true);
    expect(userDocSchema.safeParse({ ...user, traditions: ["klingon"] }).success).toBe(false);
  });
});

describe("records", () => {
  const op = { type: "remove_task", taskId: "t1" };
  const proposal = {
    touchpoint: "instruct",
    origin: "ai",
    instruction: "Drop the task",
    baseVersion: 3,
    items: [{ id: "i1", op, summary: "Remove task", dependsOn: [], status: "pending", rationale: "Not needed" }],
    reply: null,
    model: "gemini-flash-latest",
    latencyMs: 812,
    fallback: false,
    createdAt: stamp,
    expireAt: stamp,
  };

  it("accepts proposals, history, shares and the demo counter", () => {
    expect(proposalSchema.safeParse(proposal).success).toBe(true);
    const history = {
      actor: "user_via_ai",
      label: "Removed a task",
      ops: [op],
      before: { tasks: [] },
      versionBefore: 3,
      versionAfter: 4,
      createdAt: stamp,
      expireAt: stamp,
    };
    expect(historySchema.safeParse(history).success).toBe(true);
    expect(
      shareDocSchema.safeParse({ eventId: "e", ownerUid: "u", showAmounts: true, showNotes: false, createdAt: stamp, revokedAt: null })
        .success,
    ).toBe(true);
    expect(demoUsageSchema.safeParse({ day: "2026-10-28", count: 0 }).success).toBe(true);
  });

  it("parses decisions strictly", () => {
    expect(decisionSchema.safeParse({ itemId: "i1", action: "accept", editedOp: op }).success).toBe(true);
    expect(decisionSchema.safeParse({ itemId: "i1", action: "accept", origin: "user" }).success).toBe(false);
  });
});

describe("planOperationSchema", () => {
  it("rejects provenance in any payload (strict objects)", () => {
    expect(planOperationSchema.safeParse({ type: "add_idea", idea }).success).toBe(true);
    expect(planOperationSchema.safeParse({ type: "add_idea", idea: { ...idea, origin: "ai" } }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "add_idea", idea: { ...idea, source: "library" } }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "add_idea", idea, origin: "ai" }).success).toBe(false);
    const draft = { channel: "email", language: "en", subject: "Hi", body: "Hello" };
    expect(planOperationSchema.safeParse({ type: "save_draft", vendorId: "v", draft: { ...draft, origin: "ai" } }).success).toBe(false);
  });

  it("cleans free text and enforces ranges", () => {
    const parsed = planOperationSchema.parse({ type: "add_task", title: "  Book\n the  band ", category: "Music", daysBefore: -7 });
    expect(parsed).toMatchObject({ title: "Book the band" });
    expect(planOperationSchema.safeParse({ type: "add_task", title: "x", category: "y", daysBefore: -8 }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "add_task", title: "   ", category: "y", daysBefore: 1 }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "add_function", name: "Puja", startTime: "25:00" }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "add_function", name: "Puja", dayOffset: 2 }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "set_total_budget", total: 999, strategy: "rescale" }).success).toBe(false);
    expect(planOperationSchema.safeParse({ type: "delete_everything" }).success).toBe(false);
  });

  it("limits proposals to the Edit-forms table", () => {
    expect(PROPOSABLE_OP_TYPES).toHaveLength(21);
    expect(isProposable({ type: "set_summary", text: "x" })).toBe(false);
    expect(proposableOperationSchema.safeParse({ type: "remove_task", taskId: "t" }).success).toBe(true);
    expect(proposableOperationSchema.safeParse({ type: "rename_function", functionId: "f", name: "x" }).success).toBe(false);
  });
});
