import { describe, expect, it } from "vitest";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import {
  acceptAllDecisions,
  acceptAllSummary,
  batchHeading,
  buildProposal,
  isApplied,
  previewItem,
  skippedReasons,
  validPendingCount,
} from "@/lib/plan/proposals";
import { whatifInstruction } from "@/lib/plan/smartPlan";
import { TODAY, wedding } from "../../domainFixtures";

const clock = { today: TODAY, now: "2026-10-28T06:00:00.000Z" };
const cut: PlanOperation = {
  type: "adjust_budget_category",
  lineId: "line-decor",
  mode: "percent_change",
  value: -20,
  rebalance: "change_total",
};
const missing: PlanOperation = { type: "remove_budget_category", lineId: "line-stage-decor" };
const fn: PlanOperation = { type: "add_function", name: "Cocktail night", dayOffset: -1, sharePercent: 10 };
const task: PlanOperation = {
  type: "add_task",
  title: "Book the bartender",
  category: "Catering",
  daysBefore: 20,
  functionId: "fn-cocktail-night",
};

describe("proposal batches on the client (spec 6.1)", () => {
  it("dry-runs each item: valid ones stay pending, others are invalid with their reason", () => {
    const proposal = buildProposal(
      wedding(),
      {
        touchpoint: "instruct",
        origin: "ai",
        instruction: "Cut decor spend by 20%",
        items: [{ op: cut, rationale: "x".repeat(200) }, { op: missing }],
      },
      clock,
    );
    expect(proposal.items[0]).toMatchObject({ id: "item-1", status: "pending", summary: "Reduce Decor by 20% (₹3,00,000 -> ₹2,40,000)" });
    expect(proposal.items[0].rationale).toHaveLength(160);
    expect(proposal.items[1]).toMatchObject({ status: "invalid", reason: "Budget category not found in this plan" });
    expect(proposal).toMatchObject({
      baseVersion: 1,
      model: "recorded",
      fallback: false,
      reply: null,
      expireAt: "2026-10-29T06:00:00.000Z",
    });
    expect(batchHeading(proposal)).toBe('2 suggestions for "Cut decor spend by 20%"');
    expect(batchHeading({ ...proposal, instruction: "", items: proposal.items.slice(1) })).toBe("1 suggestion");
  });

  it("heads What-if trade-offs with where they came from (MQR-04)", () => {
    const task = { type: "add_task", title: "Ask for a buffet quote", category: "Catering", daysBefore: 30 } as const;
    const tradeoffs = buildProposal(
      wedding(),
      { touchpoint: "whatif", origin: "ai", instruction: whatifInstruction(2_000_000, " "), items: [{ op: task }] },
      clock,
    );
    expect(batchHeading(tradeoffs)).toBe("1 trade-off from What-if: New total ₹20,00,000");
    expect(
      batchHeading({
        ...tradeoffs,
        instruction: whatifInstruction(2_000_000, "Keep the food generous"),
        items: [...tradeoffs.items, tradeoffs.items[0]],
      }),
    ).toBe("2 trade-offs from What-if: New total ₹20,00,000: Keep the food generous");
    // Stored before the fix, with no instruction.
    expect(batchHeading({ ...tradeoffs, instruction: "" })).toBe("1 trade-off from What-if");
    expect(whatifInstruction(2_000_000, "x".repeat(600))).toHaveLength(500);
  });

  it("heads a reply-only answer without a card count (QA-13 regression)", () => {
    const reply = buildProposal(wedding(), { touchpoint: "instruct", origin: "ai", instruction: "What can you do?", items: [] }, clock);
    expect(batchHeading(reply)).toBe('Reply to "What can you do?"');
    expect(batchHeading({ ...reply, instruction: "" })).toBe("Reply");
  });

  it("applies pending dependencies first and names them", () => {
    const plan = wedding();
    const proposal = buildProposal(
      plan,
      { touchpoint: "instruct", origin: "ai", instruction: "", items: [{ op: fn }, { op: task, dependsOn: ["item-1"] }] },
      clock,
    );
    const preview = previewItem(plan, proposal, proposal.items[1], TODAY);
    expect(preview).toMatchObject({ ok: true, alsoAdds: ["Add function: Cocktail night"] });
    expect(preview.diff.rows[1]).toMatchObject({ label: "Function", after: "Cocktail night" });

    const brokenDep = { ...proposal, items: [{ ...proposal.items[0], op: { ...fn, name: "Haldi" } }, proposal.items[1]] };
    expect(previewItem(plan, brokenDep, brokenDep.items[1], TODAY).reason).toBe(
      `Depends on a suggestion that no longer applies: ${proposal.items[0].summary}`,
    );
  });

  it("previews an edited op instead of the item's", () => {
    const plan = wedding();
    const proposal = buildProposal(plan, { touchpoint: "instruct", origin: "ai", instruction: "", items: [{ op: cut }] }, clock);
    expect(previewItem(plan, proposal, proposal.items[0], TODAY, { ...cut, value: -10 } as PlanOperation).diff.rows[0].after).toBe(
      "₹2,70,000",
    );
  });

  it("accepts all valid pending items and summarises what was skipped", () => {
    const plan = wedding();
    const proposal = buildProposal(
      plan,
      { touchpoint: "instruct", origin: "ai", instruction: "", items: [{ op: cut }, { op: missing }, { op: fn }] },
      clock,
    );
    proposal.items[2] = { ...proposal.items[2], status: "declined" };
    expect(acceptAllDecisions(plan, proposal, TODAY)).toEqual([{ itemId: "item-1", action: "accept" }]);
    expect(validPendingCount(plan, proposal, TODAY)).toBe(1);
    const skipped = skippedReasons(plan, proposal, TODAY);
    expect(skipped).toEqual(["Budget category not found in this plan"]);
    expect(acceptAllSummary([{ itemId: "item-1", ok: true }], skipped)).toBe(
      "1 applied, 1 skipped: Budget category not found in this plan",
    );
    expect(
      acceptAllSummary(
        [
          { itemId: "item-1", ok: true },
          { itemId: "x", ok: false, reason: "Nope." },
        ],
        [],
      ),
    ).toBe("1 applied, 1 skipped: Nope.");
    expect(acceptAllSummary([{ itemId: "item-1", ok: true }], [])).toBe("1 applied");

    const stalePlan = { ...plan, budget: { ...plan.budget, lines: plan.budget.lines.filter((l) => l.id !== "line-decor") } };
    expect(
      skippedReasons(stalePlan, { ...proposal, items: [proposal.items[0], { ...proposal.items[1], reason: undefined }] }, TODAY),
    ).toEqual(["Budget category not found in this plan", "Not valid."]);
    expect(isApplied({ ...proposal.items[0], status: "edited" })).toBe(true);
  });
});
