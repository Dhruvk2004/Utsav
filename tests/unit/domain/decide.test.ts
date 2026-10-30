import { describe, expect, it } from "vitest";
import { planInvariantViolations } from "@/lib/domain/invariants";
import type { Proposal } from "@/lib/domain/model/records";
import { decideProposal } from "@/lib/domain/ops/decide";
import { EDIT_REJECTED, isFaithfulEdit } from "@/lib/domain/ops/editIntegrity";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { TODAY, wedding } from "../../domainFixtures";

const decorCut: PlanOperation = {
  type: "adjust_budget_category",
  lineId: "line-decor",
  mode: "percent_change",
  value: -20,
  rebalance: "change_total",
};
const addPuja: PlanOperation = { type: "add_function", name: "Puja", dayOffset: -3, sharePercent: 5 };
const pujaTask: PlanOperation = {
  type: "add_task",
  title: "Book the puja priest",
  category: "Rituals",
  daysBefore: 20,
  functionId: "fn-puja",
};
const ideaOp: PlanOperation = {
  type: "add_idea",
  idea: {
    title: "Phoolon ki holi",
    description: "Flower petals instead of colours.",
    category: "ritual",
    estimatedCost: 10_000,
    costBasis: "per event",
    basis: ["details.tradition"],
    effort: "vendor",
  },
};

function proposal(items: { op: PlanOperation; dependsOn?: string[] }[], origin: Proposal["origin"] = "ai"): Proposal {
  return {
    touchpoint: "instruct",
    origin,
    instruction: "test",
    baseVersion: 1,
    items: items.map((item, i) => ({
      id: `i${i + 1}`,
      op: item.op,
      summary: `item ${i + 1}`,
      dependsOn: item.dependsOn ?? [],
      status: "pending",
      rationale: "",
    })),
    reply: null,
    model: "test",
    latencyMs: 0,
    fallback: false,
    createdAt: "2026-10-28T06:00:00.000Z",
    expireAt: "2026-10-29T06:00:00.000Z",
  };
}

const ctx = { today: TODAY };
const status = (p: Proposal) => p.items.map((i) => i.status);

describe("decideProposal: accept", () => {
  it("applies an accepted item with AI provenance and reports the applied op", () => {
    const out = decideProposal(wedding(), proposal([{ op: decorCut }]), [{ itemId: "i1", action: "accept" }], ctx);
    expect(out.results).toEqual([{ itemId: "i1", ok: true, status: "accepted" }]);
    expect(out.plan.budget.total).toBe(2_440_000);
    expect(out.applied).toEqual([decorCut]);
    expect(planInvariantViolations(out.plan)).toEqual([]);
  });

  it("accepts a faithful edit as edited, storing the edited op and handing text to the user", () => {
    const edited = { ...pujaTask, functionId: null, title: "Call the priest" };
    const out = decideProposal(wedding(), proposal([{ op: pujaTask }]), [{ itemId: "i1", action: "accept", editedOp: edited }], ctx);
    expect(out.proposal.items[0]).toMatchObject({ status: "edited", op: edited });
    expect(out.plan.tasks.find((t) => t.title === "Call the priest")?.origin).toBe("user");
  });

  it("treats an unchanged edit as a plain accept", () => {
    const out = decideProposal(
      wedding(),
      proposal([{ op: decorCut }]),
      [{ itemId: "i1", action: "accept", editedOp: { ...decorCut } }],
      ctx,
    );
    expect(status(out.proposal)).toEqual(["accepted"]);
    expect(out.proposal.items[0].summary).toBe("item 1");
  });

  it("rebuilds an edited item's summary from what was applied (MQW-05, BP-05 regression)", () => {
    const out = decideProposal(
      wedding(),
      proposal([{ op: decorCut }]),
      [{ itemId: "i1", action: "accept", editedOp: { ...decorCut, value: -25 } }],
      ctx,
    );
    expect(out.proposal.items[0].summary).toBe("Reduce Decor by 25% (₹3,00,000 -> ₹2,25,000)");
    const retitled = decideProposal(
      wedding(),
      proposal([{ op: pujaTask }]),
      [{ itemId: "i1", action: "accept", editedOp: { ...pujaTask, functionId: null, title: "Order the Peppa Pig cake" } }],
      ctx,
    );
    expect(retitled.proposal.items[0].summary).toMatch(/^Add task: Order the Peppa Pig cake/);
  });

  it.each([
    ["another op type", { type: "set_budget_note", lineId: "line-decor", note: "x" }],
    ["a different target", { ...decorCut, lineId: "line-venue" }],
  ] as [string, PlanOperation][])("rejects an edit to %s and leaves the item pending", (_, editedOp) => {
    const out = decideProposal(wedding(), proposal([{ op: decorCut }]), [{ itemId: "i1", action: "accept", editedOp }], ctx);
    expect(out.results[0]).toEqual({ itemId: "i1", ok: false, reason: EDIT_REJECTED });
    expect(status(out.proposal)).toEqual(["pending"]);
    expect(out.applied).toEqual([]);
  });

  it("marks an item that no longer applies as invalid", () => {
    const op: PlanOperation = { type: "remove_task", taskId: "task-gone" };
    const out = decideProposal(wedding(), proposal([{ op }]), [{ itemId: "i1", action: "accept" }], ctx);
    expect(out.proposal.items[0]).toMatchObject({ status: "invalid", reason: "Task not found in this plan" });
  });

  it("rejects op types that are not proposable", () => {
    const op: PlanOperation = { type: "rename_function", functionId: "fn-sangeet", name: "Cocktails" };
    const out = decideProposal(wedding(), proposal([{ op }]), [{ itemId: "i1", action: "accept" }], ctx);
    expect(out.results[0]).toEqual({ itemId: "i1", ok: false, reason: "Not editable" });
  });

  it("also accepts the items an item depends on, first", () => {
    const p = proposal([{ op: addPuja }, { op: pujaTask, dependsOn: ["i1"] }]);
    const out = decideProposal(wedding(), p, [{ itemId: "i2", action: "accept" }], ctx);
    expect(status(out.proposal)).toEqual(["accepted", "accepted"]);
    expect(out.applied).toEqual([addPuja, pujaTask]);
    expect(out.plan.tasks.find((t) => t.functionId === "fn-puja")).toBeDefined();
  });

  it("marks an item invalid when its dependency no longer applies", () => {
    const p = proposal([{ op: { ...addPuja, name: "Sangeet" } }, { op: pujaTask, dependsOn: ["i1", "i9"] }]);
    const out = decideProposal(wedding(), p, [{ itemId: "i2", action: "accept" }], ctx);
    expect(out.proposal.items[1]).toMatchObject({ status: "invalid", reason: "Depends on a suggestion that no longer applies: item 1" });
    expect(status(out.proposal)[0]).toBe("pending");
  });

  it("accepts all in order, reporting the ones earlier accepts made invalid", () => {
    const p = proposal([{ op: addPuja }, { op: addPuja }, { op: decorCut }]);
    const decisions = p.items.map((i) => ({ itemId: i.id, action: "accept" as const }));
    const out = decideProposal(wedding(), p, decisions, ctx);
    expect(status(out.proposal)).toEqual(["accepted", "invalid", "accepted"]);
    expect(out.applied).toHaveLength(2);
  });

  it("refuses to decide an item twice or an unknown item", () => {
    const first = decideProposal(wedding(), proposal([{ op: decorCut }]), [{ itemId: "i1", action: "accept" }], ctx);
    const again = decideProposal(
      first.plan,
      first.proposal,
      [
        { itemId: "i1", action: "decline" },
        { itemId: "x", action: "accept" },
      ],
      ctx,
    );
    expect(again.results).toEqual([
      { itemId: "i1", ok: false, reason: "This suggestion was already decided" },
      { itemId: "x", ok: false, reason: "Suggestion not found" },
    ]);
  });
});

describe("decideProposal: decline and restore", () => {
  it("declines an item with its pending dependents", () => {
    const p = proposal([{ op: addPuja }, { op: pujaTask, dependsOn: ["i1"] }]);
    const out = decideProposal(wedding(), p, [{ itemId: "i1", action: "decline" }], ctx);
    expect(status(out.proposal)).toEqual(["declined", "declined"]);
    expect(out.plan).toEqual(wedding());
  });

  it("remembers a declined idea's title and forgets it on restore", () => {
    const declined = decideProposal(wedding(), proposal([{ op: ideaOp }]), [{ itemId: "i1", action: "decline" }], ctx);
    expect(declined.plan.dismissedIdeaTitles).toEqual(["phoolon ki holi"]);
    const restored = decideProposal(declined.plan, declined.proposal, [{ itemId: "i1", action: "restore" }], ctx);
    expect(restored.results[0]).toMatchObject({ ok: true, status: "pending" });
    expect(restored.plan.dismissedIdeaTitles).toEqual([]);
  });

  it("restoring leaves no `reason` key behind, not even an undefined one (QA-01 regression)", () => {
    const declined = decideProposal(wedding(), proposal([{ op: decorCut }]), [{ itemId: "i1", action: "decline" }], ctx);
    const restored = decideProposal(declined.plan, declined.proposal, [{ itemId: "i1", action: "restore" }], ctx);
    expect(restored.proposal.items[0].status).toBe("pending");
    expect(Object.keys(restored.proposal.items[0])).not.toContain("reason");
  });

  it("restores as invalid when the item no longer applies", () => {
    const declined = decideProposal(wedding(), proposal([{ op: addPuja }]), [{ itemId: "i1", action: "decline" }], ctx);
    const plan = decideProposal(declined.plan, proposal([{ op: addPuja }]), [{ itemId: "i1", action: "accept" }], ctx).plan;
    const restored = decideProposal(plan, declined.proposal, [{ itemId: "i1", action: "restore" }], ctx);
    expect(restored.proposal.items[0]).toMatchObject({ status: "invalid", reason: 'There is already a function called "Puja"' });
  });

  it("restores only declined items", () => {
    const out = decideProposal(wedding(), proposal([{ op: decorCut }]), [{ itemId: "i1", action: "restore" }], ctx);
    expect(out.results[0]).toEqual({ itemId: "i1", ok: false, reason: "Only declined suggestions can be restored" });
  });
});

describe("isFaithfulEdit", () => {
  it.each([
    [
      "the amounts of a What-if table",
      { type: "set_budget_lines", lines: [{ lineId: "a", amount: 1 }] },
      { type: "set_budget_lines", lines: [{ lineId: "a", amount: 2 }] },
      true,
    ],
    [
      "the rows of a What-if table",
      { type: "set_budget_lines", lines: [{ lineId: "a", amount: 1 }] },
      { type: "set_budget_lines", lines: [{ lineId: "b", amount: 1 }] },
      false,
    ],
    [
      "vendor notes",
      { type: "update_vendor", vendorId: "v", patch: { notes: "a" } },
      { type: "update_vendor", vendorId: "v", patch: { notes: "b" } },
      true,
    ],
    [
      "a vendor label",
      { type: "update_vendor", vendorId: "v", patch: { notes: "a" } },
      { type: "update_vendor", vendorId: "v", patch: { notes: "a", label: "x" } },
      false,
    ],
    ["guest totals", { type: "set_guests", guests: { total: 40 } }, { type: "set_guests", guests: { total: 45, kids: 30 } }, true],
    ["dietary counts", { type: "set_guests", guests: { total: 40 } }, { type: "set_guests", guests: { total: 40, veg: 30 } }, false],
    [
      "an idea's basis",
      ideaOp,
      { ...ideaOp, idea: { ...(ideaOp as Extract<PlanOperation, { type: "add_idea" }>).idea, basis: [] } },
      false,
    ],
    ["a removal", { type: "remove_task", taskId: "t" }, { type: "remove_task", taskId: "t" }, true],
  ] as [string, PlanOperation, PlanOperation, boolean][])("judges an edit of %s", (_, original, edited, expected) => {
    expect(isFaithfulEdit(original, edited)).toBe(expected);
  });

  it("never accepts an edit of a manual-only op", () => {
    const op: PlanOperation = { type: "clear_dismissed_ideas" };
    expect(isFaithfulEdit(op, op)).toBe(false);
  });
});
