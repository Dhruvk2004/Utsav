import { describe, expect, it } from "vitest";
import { describeOperation } from "@/lib/domain/describe";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { TODAY, wedding } from "../../domainFixtures";

/**
 * Card wording the main describe suite does not reach (QA branch pass): function moves earlier and
 * later with linked tasks, dates already passed, long name lists, vendor note changes, renames of
 * unknown ids, and cards that no longer apply (no "after" plan).
 */

function card(op: PlanOperation, plan: EventDoc = wedding(), today = TODAY) {
  const run = applyOperations(plan, [op], { today, actor: "ai", proposalOrigin: "ai" });
  return describeOperation(plan, run.results[0].ok ? run.plan : null, op, today);
}

const fn = (plan: EventDoc, id: string) => plan.functions.find((f) => f.id === id) as EventDoc["functions"][number];

describe("function cards", () => {
  it("moving a function earlier says how many linked tasks move and by how much", () => {
    const plan = wedding();
    const sangeet = fn(plan, "fn-sangeet");
    const date = new Date(Date.parse(sangeet.date) - 86_400_000).toISOString().slice(0, 10);
    const diff = card({ type: "move_function", functionId: "fn-sangeet", date }, plan);
    expect(diff.title).toMatch(/^Move Sangeet to /);
    expect(diff.notes.join(" ")).toMatch(/linked tasks? move 1 day earlier/);
  });

  it("changing only the time keeps the date in the title", () => {
    const diff = card({ type: "move_function", functionId: "fn-sangeet", startTime: "18:00", endTime: "22:00" });
    expect(diff.title).toBe("Change the time of Sangeet");
    expect(diff.notes).toEqual([]);
  });

  it("warns when the function's date has already passed (an event in progress)", () => {
    const plan = wedding();
    const haldi = fn(plan, "fn-haldi");
    const later = new Date(Date.parse(haldi.date) + 3 * 86_400_000).toISOString().slice(0, 10);
    const diff = describeOperation(
      plan,
      plan,
      { type: "move_function", functionId: "fn-haldi", startTime: "10:00", endTime: "12:00" },
      later,
    );
    expect(diff.notes).toContain("That date has passed.");
  });

  it("removing a function lists what gets unlinked, shortening long lists", () => {
    const diff = card({ type: "remove_function", functionId: "fn-wedding" });
    expect(diff.title).toBe("Remove function: Wedding");
    expect(diff.notes[0]).toMatch(/^Linked tasks and vendors will be unlinked: /);
    expect(diff.notes[0]).toMatch(/ and \d+ more\.$/);
  });

  it("removing a function nothing links to says so", () => {
    const plan = wedding();
    plan.tasks = plan.tasks.map((t) => (t.functionId === "fn-reception" ? { ...t, functionId: null } : t));
    plan.vendors = plan.vendors.map((v) => ({ ...v, functionIds: v.functionIds.filter((id) => id !== "fn-reception") }));
    expect(card({ type: "remove_function", functionId: "fn-reception" }, plan).notes[0]).toBe("Nothing is linked to it.");
  });

  it("a share change lists how the other shares were rebalanced", () => {
    const diff = card({ type: "set_function_share", functionId: "fn-sangeet", percent: 30 });
    expect(diff.title).toBe("Set Sangeet's share to 30%");
    expect(diff.notes.join(" ")).toMatch(/Other shares rebalanced to total 100%: /);
  });
});

describe("cards about things that are gone", () => {
  it("renames fall back to a generic noun for an unknown id", () => {
    expect(card({ type: "rename_budget_category", lineId: "nope", category: "Flowers" }).title).toBe("Rename category to Flowers");
    expect(card({ type: "rename_function", functionId: "nope", name: "Cocktails" }).title).toBe("Rename function to Cocktails");
  });

  it("a card that no longer applies keeps its title and shows no rows", () => {
    for (const op of [
      { type: "move_function", functionId: "nope", startTime: "10:00", endTime: "11:00" },
      { type: "set_function_share", functionId: "nope", percent: 10 },
      { type: "update_task", taskId: "nope", done: true },
      { type: "set_budget_note", lineId: "nope", note: "x" },
    ] as PlanOperation[]) {
      const diff = card(op);
      expect(diff.title.length).toBeGreaterThan(0);
      expect(diff.rows).toEqual([]);
    }
    const total = describeOperation(wedding(), null, { type: "set_total_budget", total: 2_000_000, strategy: "rescale" }, TODAY);
    expect(total).toEqual({ title: "Set the total budget to ₹20,00,000", rows: [], notes: [] });
    const reset = describeOperation(wedding(), null, { type: "reset_section", section: "vendors" }, TODAY);
    expect(reset).toMatchObject({ title: "Reset Vendors to the starter template", rows: [], notes: [] });
  });
});

describe("vendor and date cards", () => {
  it("a vendor notes change shows before and after, with None for cleared notes", () => {
    const plan = wedding();
    const vendor = plan.vendors[0];
    const withNotes = card({ type: "update_vendor", vendorId: vendor.id, patch: { notes: "Ask about parking" } }, plan);
    expect(withNotes.rows).toContainEqual({ label: "Notes", before: vendor.notes || null, after: "Ask about parking" });
  });

  it("moving the event date earlier shows a minus delta", () => {
    const plan = wedding();
    const date = new Date(Date.parse(plan.details.eventDate) - 2 * 86_400_000).toISOString().slice(0, 10);
    const diff = card({ type: "set_details", eventDate: date }, plan);
    expect(diff.rows[0].delta).toMatchObject({ text: "−2 days", label: "2 days earlier" });
  });
});
