import { describe, expect, it } from "vitest";
import { PLAN_TOOLS, TOOL_NAMES, toolCallsToItems } from "@/lib/ai/tools";
import { buildProposal } from "@/lib/plan/proposals";
import { TODAY, wedding } from "../../domainFixtures";
import { call } from "../../helpers/fakeModel";

const keep = (text: string) => text;
const map = (calls: ReturnType<typeof call>[], plan = wedding()) => toolCallsToItems(calls, plan, TODAY, keep);

describe("PLAN_TOOLS (spec 6.3)", () => {
  it("declares one tool per proposable change plus reply, with no label or contact fields", () => {
    expect(PLAN_TOOLS.map((t) => t.name)).toEqual(TOOL_NAMES);
    expect(TOOL_NAMES).toContain("reply");
    expect(TOOL_NAMES).not.toContain("reset_section");
    const vendor = PLAN_TOOLS.find((t) => t.name === "add_vendor")?.parametersJsonSchema as { properties: Record<string, unknown> };
    expect(Object.keys(vendor.properties)).not.toContain("label");
    expect(Object.keys(vendor.properties)).not.toContain("contact");
    expect(PLAN_TOOLS.every((t) => (t.parametersJsonSchema as { type?: string }).type === "object")).toBe(true);
  });
});

describe("toolCallsToItems", () => {
  it("resolves names to ids, case and spacing aside", () => {
    const { items } = map([call("adjust_budget_category", { category: "  DECOR ", mode: "percent_change", value: -20, why: "You asked" })]);
    expect(items).toEqual([
      {
        id: "item-1",
        op: { type: "adjust_budget_category", lineId: "line-decor", mode: "percent_change", value: -20, rebalance: "change_total" },
        rationale: "You asked",
        dependsOn: [],
        invalidReason: undefined,
      },
    ]);
  });

  it("marks unknown and ambiguous names invalid with a reason, still as a card", () => {
    const { items } = map([
      call("set_budget_note", { category: "Stage decor", note: "x" }),
      call("move_function", { function: "Sangeet", weekday: "friday" }),
      call("remove_vendor", { vendor: "M" }),
    ]);
    expect(items[0].invalidReason).toBe('No budget category called "Stage decor"');
    expect(items[1].invalidReason).toBeUndefined();
    expect(items[2].invalidReason).toMatch(/match "M"; pick one/);
    const proposal = buildProposal(
      wedding(),
      { touchpoint: "instruct", origin: "ai", instruction: "x", items },
      { today: TODAY, now: "2026-10-28T06:00:00.000Z" },
    );
    expect(proposal.items.map((i) => i.status)).toEqual(["invalid", "pending", "invalid"]);
    expect(proposal.items[0].reason).toBe('No budget category called "Stage decor"');
  });

  it("links an item to the earlier item that creates what it refers to", () => {
    const plan = wedding();
    plan.budget.lines = plan.budget.lines.filter((l) => l.id !== "line-photography");
    plan.vendors = plan.vendors.filter((v) => v.budgetLineId !== "line-photography");
    const { items } = map(
      [
        call("add_budget_category", { category: "Photography", percent: 4 }),
        call("add_vendor", { category: "Photographer", budgetCategory: "Photography", bookByDaysBefore: 90, functions: ["Wedding"] }),
        call("add_task", { title: "Shortlist photographers", category: "Photography", daysBefore: 120 }),
      ],
      plan,
    );
    expect(items[0].op).toMatchObject({ type: "add_budget_category", amount: 100_000, fundFrom: "contingency" });
    expect(items[1]).toMatchObject({ dependsOn: ["item-1"], op: { functionIds: ["fn-wedding"] } });
    expect(items[2].dependsOn).toEqual([]);
  });

  it("maps every tool to its op", () => {
    const { items, reply } = map([
      call("remove_budget_category", { category: "Entertainment", moveTo: "Decor" }),
      call("set_total_budget", { total: 2_200_000 }),
      call("add_function", { name: "Cocktail night", dayOffset: -3, sharePercent: 5 }),
      call("add_function", { name: "Puja", date: "2026-12-20" }),
      call("set_function_share", { function: "Haldi", percent: 12 }),
      call("remove_function", { function: "Mehndi" }),
      call("add_task", { title: "Book a pandit", category: "Rituals", function: "Wedding" }),
      call("update_task", { taskId: "Send invitations", done: true }),
      call("remove_task", { taskId: "Return rented items" }),
      call("update_vendor", { vendor: "Caterer", notes: "Ask about Jain options", budgetCategory: "Catering" }),
      call("set_vendor_status", { vendor: "Mehndi artist", status: "booked", quotedAmount: 42_000 }),
      call("add_idea", {
        title: "Bilingual welcome boards",
        description: "Both languages",
        category: "decor",
        basis: ["details.tradition", "made.up"],
      }),
      call("set_guests", { total: 450, kids: 40 }),
      call("set_event_date", { shiftDays: 7 }),
      call("add_budget_category", { category: "Fireworks" }),
      call("set_event_date", {}),
      call("set_total_budget", { total: 2_000_000, strategy: "replan" }),
      call("reply", { text: "You have paid ₹2,40,000." }),
    ]);
    expect(items.map((i) => i.op.type)).toEqual([
      "remove_budget_category",
      "set_total_budget",
      "add_function",
      "add_function",
      "set_function_share",
      "remove_function",
      "add_task",
      "update_task",
      "remove_task",
      "update_vendor",
      "set_vendor_status",
      "add_idea",
      "set_guests",
      "set_details",
      "add_budget_category",
      "set_details",
    ]);
    expect(items[0].op).toMatchObject({ lineId: "line-entertainment", moveToLineId: "line-decor" });
    expect(items[6].op).toMatchObject({ functionId: "fn-wedding", daysBefore: 14 });
    expect(items[11].op).toMatchObject({ idea: { basis: ["details.tradition"], costBasis: "per event", effort: "mixed" } });
    expect(items[13].op).toMatchObject({ type: "set_details", eventDate: expect.any(String) });
    expect(items[14].invalidReason).toBe("Say how much to give Fireworks");
    expect(items[15].invalidReason).toMatch(/Say the new date/);
    expect(reply).toMatch(/^To re-plan around ₹20,00,000.*You have paid ₹2,40,000\.$/);
  });

  it("drops unknown tools and malformed arguments, and filters model text", () => {
    const shout = (text: string) => text.replace("98200 12345", "").trim();
    const result = toolCallsToItems(
      [
        call("delete_everything", {}),
        call("add_task", { title: 5 }),
        call("add_task", { title: "Call 98200 12345", category: "Calls", daysBefore: 5, why: "Ring 98200 12345" }),
        call("add_vendor", { category: "DJ", bookByDaysBefore: 30, questions: ["Call 98200 12345?"] }),
      ],
      wedding(),
      TODAY,
      shout,
    );
    expect(result.dropped).toBe(2);
    expect(result.items[0]).toMatchObject({ op: { title: "Call" }, rationale: "Ring" });
    expect(result.items[1].op).toMatchObject({ questions: ["Call ?"] });
    expect(result.reply).toBeNull();
  });

  it("filters notes and idea text, and drops an op the schema refuses", () => {
    const upper = (text: string) => text.toUpperCase();
    const { items, dropped } = toolCallsToItems(
      [
        call("set_budget_note", { category: "Decor", note: "keep it light" }),
        call("update_vendor", { vendor: "Caterer", questions: ["menu?"] }),
        call("add_idea", { title: "a", description: "b", category: "decor" }),
        call("add_vendor", { category: "", bookByDaysBefore: 3 }),
      ],
      wedding(),
      TODAY,
      upper,
    );
    expect(items.map((i) => i.op)).toEqual([
      { type: "set_budget_note", lineId: "line-decor", note: "KEEP IT LIGHT" },
      { type: "update_vendor", vendorId: expect.any(String), patch: { questions: ["MENU?"] } },
      expect.objectContaining({ idea: expect.objectContaining({ title: "A", description: "B" }) }),
    ]);
    expect(dropped).toBe(1);
  });
});
