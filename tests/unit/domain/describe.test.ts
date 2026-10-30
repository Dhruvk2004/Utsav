import { describe, expect, it } from "vitest";
import { describeOperation, estimateText, functionWhen, moneyDelta, summaryOf, taskDue } from "@/lib/domain/describe";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { birthday, TODAY, wedding } from "../../domainFixtures";

function card(op: PlanOperation, plan: EventDoc = wedding(), proposalOrigin: "ai" | "code" = "ai") {
  const run = applyOperations(plan, [op], { today: TODAY, actor: "ai", proposalOrigin });
  const after = run.results[0].ok ? run.plan : null;
  return describeOperation(plan, after, op, TODAY);
}

const rowOf = (diff: ReturnType<typeof card>, label: string) => diff.rows.find((row) => row.label === label);

describe("describeOperation (spec 12.2): code-built card titles and diffs", () => {
  it("describes a percent cut that lowers the total", () => {
    const diff = card({
      type: "adjust_budget_category",
      lineId: "line-decor",
      mode: "percent_change",
      value: -20,
      rebalance: "change_total",
    });
    expect(diff.title).toBe("Reduce Decor by 20%");
    expect(rowOf(diff, "Decor")).toMatchObject({
      before: "₹3,00,000",
      after: "₹2,40,000",
      delta: { text: "−₹60,000", tone: "less", label: "₹60,000 less" },
    });
    expect(rowOf(diff, "Total")).toMatchObject({ after: "₹24,40,000", total: true });
    expect(summaryOf(diff)).toBe("Reduce Decor by 20% (₹3,00,000 -> ₹2,40,000)");
  });

  it.each([
    [{ mode: "set_amount", value: 250_000, rebalance: "to_contingency" }, "Set Decor to ₹2,50,000", "more"],
    [{ mode: "change_amount", value: 10_000, rebalance: "to_contingency" }, "Increase Decor by ₹10,000", "less"],
    [{ mode: "percent_change", value: 10, rebalance: "spread_to_others" }, "Increase Decor by 10%", null],
  ] as const)("titles %o", (change, title, contingencyTone) => {
    const diff = card({ type: "adjust_budget_category", lineId: "line-decor", ...change });
    expect(diff.title).toBe(title);
    if (contingencyTone) expect(rowOf(diff, "Contingency")?.delta?.tone).toBe(contingencyTone);
    else expect(diff.notes[0]).toMatch(/^8 other categories adjusted; total unchanged at ₹25,00,000\.$/);
  });

  it("titles an op that does not apply from the plan before it, with no rows", () => {
    const op: PlanOperation = {
      type: "adjust_budget_category",
      lineId: "line-missing",
      mode: "percent_change",
      value: -5,
      rebalance: "change_total",
    };
    expect(card(op)).toEqual({ title: "Reduce a budget category by 5%", rows: [], notes: [] });
  });

  it("describes adding, removing and noting budget categories", () => {
    const fromContingency = card({ type: "add_budget_category", category: "Fireworks", amount: 20_000, fundFrom: "contingency" });
    expect(fromContingency.title).toBe("Add budget category: Fireworks");
    expect(rowOf(fromContingency, "Contingency")?.after).toBe("₹1,30,000");
    expect(card({ type: "add_budget_category", category: "Fireworks", amount: 20_000, fundFrom: "increase_total" }).rows[1].label).toBe(
      "Total",
    );
    expect(card({ type: "add_budget_category", category: "Fireworks", amount: 20_000, fundFrom: "spread" }).notes[0]).toContain(
      "total unchanged",
    );

    const removed = card({ type: "remove_budget_category", lineId: "line-photography" });
    expect(removed.title).toBe("Remove budget category: Photography");
    expect(removed.rows[0]).toMatchObject({ before: "₹2,00,000", after: "Removed" });
    expect(removed.notes[0]).toBe("2 vendors move to Contingency: Videographer, Photographer.");
    expect(card({ type: "remove_budget_category", lineId: "line-contingency" }).rows).toEqual([]);

    expect(card({ type: "set_budget_note", lineId: "line-decor", note: "Pastel only" })).toMatchObject({
      title: "Note on Decor",
      rows: [{ before: null, after: "Pastel only" }],
    });
  });

  it("describes total and whole-table budget changes", () => {
    expect(card({ type: "set_total_budget", total: 2_200_000, strategy: "rescale" }).title).toBe("Set the total budget to ₹22,00,000");
    const plan = wedding();
    const lines = plan.budget.lines.map((line) => ({ lineId: line.id, amount: line.id === "line-decor" ? 200_000 : line.amount }));
    const diff = card({ type: "set_budget_lines", lines }, plan);
    expect(diff.title).toBe("Re-plan the budget for ₹24,00,000");
    expect(diff.rows.map((row) => row.label)).toEqual(["Decor", "Total"]);
  });

  it("describes function changes with dates, shares and linked items", () => {
    const added = card({
      type: "add_function",
      name: "Cocktail night",
      dayOffset: -1,
      sharePercent: 10,
      startTime: "20:00",
      endTime: "23:00",
    });
    expect(added.title).toBe("Add function: Cocktail night");
    expect(rowOf(added, "When")?.after).toBe("Sat 26 Dec · 8:00 pm – 11:00 pm");
    expect(added.notes[0]).toMatch(/^Other shares rebalanced to total 100%: Haldi 9%/);

    const moved = card({ type: "move_function", functionId: "fn-sangeet", weekday: "friday" });
    expect(moved.title).toBe("Move Sangeet to Fri 25 Dec");
    expect(moved.notes).toEqual(["2 linked tasks move 1 day earlier."]);
    expect(card({ type: "move_function", functionId: "fn-sangeet", startTime: "18:00", endTime: "22:00" }).title).toBe(
      "Change the time of Sangeet",
    );

    const share = card({ type: "set_function_share", functionId: "fn-sangeet", percent: 20 });
    expect(share.rows[0]).toMatchObject({ label: "Share", before: "15%", after: "20%" });

    const removed = card({ type: "remove_function", functionId: "fn-mehndi" });
    expect(removed.notes[0]).toBe(
      "Linked tasks and vendors will be unlinked: Pick mehndi designs, Order mehndi cones for guests, Mehndi artist.",
    );
    expect(card({ type: "remove_function", functionId: "fn-x" }).title).toBe("Remove function: a function");
  });

  it("describes task changes", () => {
    expect(
      card({ type: "add_task", title: "Book a dhol player", category: "Entertainment", daysBefore: 30, functionId: "fn-sangeet" }).rows,
    ).toEqual([
      { label: "Due", before: null, after: "Fri 27 Nov · 30 days before" },
      { label: "Function", before: null, after: "Sangeet" },
    ]);
    expect(card({ type: "update_task", taskId: "task-book-makeup-artist", done: true }).title).toBe("Mark done: Book makeup artist");
    const updated = card({
      type: "update_task",
      taskId: "task-book-decorator",
      title: "Book the decorator",
      category: "Decor team",
      daysBefore: 40,
    });
    expect(updated.rows.map((row) => row.label)).toEqual(["Title", "Category", "Due"]);
    expect(card({ type: "update_task", taskId: "task-book-decorator", done: false }).title).toBe("Mark not done: Book decorator");
    expect(card({ type: "remove_task", taskId: "task-book-decorator" })).toMatchObject({
      title: "Remove task: Book decorator",
      notes: ["This task will be deleted."],
    });
  });

  it("describes vendor changes", () => {
    const added = card({
      type: "add_vendor",
      category: "Photo booth",
      budgetLineId: "line-entertainment",
      bookByDaysBefore: 30,
      questions: ["Props?"],
    });
    expect(added.rows).toEqual([
      { label: "Budget line", before: null, after: "Entertainment" },
      { label: "Book by", before: null, after: "Fri 27 Nov · 30 days before" },
    ]);
    expect(added.notes).toEqual(["1 question to ask."]);
    const booked = card({ type: "set_vendor_status", vendorId: "vendor-mehndi-artist", status: "booked" });
    expect(booked.title).toBe("Mark Mehndi artist as booked");
    expect(rowOf(booked, "Committed")).toMatchObject({ before: "₹11,18,000", after: "₹11,63,000" });
    const paid = card({
      type: "set_vendor_status",
      vendorId: "vendor-decorator",
      status: "paid",
      quotedAmount: 50_000,
      paidAmount: 20_000,
    });
    expect(paid.rows.map((row) => row.label)).toEqual(["Status", "Quoted", "Paid", "Committed"]);
    const updated = card({
      type: "update_vendor",
      vendorId: "vendor-decorator",
      patch: { notes: "Pastels", questions: ["Q1"], budgetLineId: "line-contingency", functionIds: ["fn-haldi"] },
    });
    expect(updated.rows.map((row) => row.label)).toEqual(["Notes", "Questions", "Budget line", "Functions"]);
    expect(card({ type: "remove_vendor", vendorId: "vendor-decorator" }).notes).toEqual([
      "Notes, amounts and drafts for this vendor will be deleted.",
    ]);
    expect(card({ type: "set_vendor_status", vendorId: "vendor-x", status: "paid" }).title).toBe("Mark a vendor as paid");
  });

  it("describes ideas, guests, the event date and section resets", () => {
    const idea = card({
      type: "add_idea",
      idea: {
        title: "Kids corner",
        description: "Crafts",
        category: "activity",
        estimatedCost: 300,
        costBasis: "per kid",
        basis: [],
        effort: "diy",
      },
    });
    expect(idea).toEqual({
      title: "Idea: Kids corner",
      rows: [{ label: "Estimate", before: null, after: "≈ ₹300 per kid (estimate)" }],
      notes: ["Crafts"],
    });

    const guests = card({ type: "set_guests", guests: { total: 450, adults: 420 } });
    expect(guests.title).toBe("Set guests to 450");
    expect(guests.rows.map((row) => row.label)).toEqual(["Guests", "Per guest"]);
    expect(card({ type: "set_guests", guests: { kids: 40 } }).title).toBe("Set kids to 40");
    expect(card({ type: "set_guests", guests: { elderly: 50 } }).title).toBe("Set elderly guests to 50");
    expect(card({ type: "set_guests", guests: { veg: 20 } }).title).toBe("Update guest counts");

    const date = card({ type: "set_details", eventDate: "2027-01-03" });
    expect(date.title).toBe("Move the event date to Sun 3 Jan 2027");
    expect(date.rows[0].delta).toEqual({ text: "+7 days", tone: "neutral", label: "7 days later" });
    expect(date.notes[0]).toBe("22 open tasks and 5 functions move with it.");
    expect(card({ type: "set_details", city: "Mumbai" }).title).toBe("Update event details");

    const reset = card({ type: "reset_section", section: "ideas" }, wedding(), "code");
    expect(reset).toMatchObject({ title: "Reset Ideas to the starter template", rows: [{ label: "Ideas", before: "6" }] });
  });

  it("names manual-only changes for the Undo toast", () => {
    const plan = wedding();
    const titles = [
      { type: "rename_budget_category", lineId: "line-decor", category: "Flowers" },
      { type: "rename_function", functionId: "fn-haldi", name: "Halad" },
      { type: "save_draft", vendorId: "vendor-decorator", draft: { channel: "email", language: "en", subject: "", body: "Hi" } },
      { type: "remove_draft", vendorId: "vendor-decorator", draftId: "d" },
      { type: "save_idea", ideaId: "idea-fusion-haldi" },
      { type: "update_idea", ideaId: "idea-x", patch: {} },
      { type: "remove_idea", ideaId: "idea-fusion-haldi" },
      { type: "clear_dismissed_ideas" },
      { type: "set_personalisation", theme: "x" },
      { type: "set_summary", text: "x" },
    ] satisfies PlanOperation[];
    expect(titles.map((op) => describeOperation(plan, null, op, TODAY).title)).toEqual([
      "Rename Decor to Flowers",
      "Rename Haldi to Halad",
      "Save the enquiry draft",
      "Delete the enquiry draft",
      "Save idea: Fusion haldi",
      "Edit idea: idea",
      "Remove idea: Fusion haldi",
      "Clear dismissed ideas",
      "Update personalisation",
      "Edit the summary",
    ]);
  });

  it("formats helpers", () => {
    expect(moneyDelta(5, 5)).toBeUndefined();
    expect(estimateText(6000, "per event")).toBe("≈ ₹6,000 (estimate)");
    expect(functionWhen({ date: "2026-12-25", startTime: null, endTime: null })).toBe("Fri 25 Dec");
    expect(taskDue({ pinnedDate: null, daysBefore: 200 }, birthday().details.eventDate, TODAY)).toBe("Wed 28 Oct · 35 days before");
  });
});
