import { describe, expect, it } from "vitest";
import { editFormFor, opDueDate, visibleFields, type OpForm } from "@/lib/client/opForms";
import type { EventDoc } from "@/lib/domain/model/event";
import { isFaithfulEdit } from "@/lib/domain/ops/editIntegrity";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { TODAY, wedding } from "../../domainFixtures";

const plan = wedding();
const form = (op: PlanOperation, on: EventDoc = plan) => editFormFor(op, on, TODAY) as OpForm;
const built = (op: PlanOperation, values: Record<string, string | string[]> = {}) => form(op).build({ ...form(op).values, ...values });

// Every proposable op's form rebuilds the same op from its own values, so an untouched Edit is faithful.
const ROUND_TRIP: PlanOperation[] = [
  { type: "adjust_budget_category", lineId: "line-decor", mode: "percent_change", value: -20, rebalance: "change_total" },
  { type: "add_budget_category", category: "Fireworks", amount: 20_000, fundFrom: "contingency" },
  { type: "remove_budget_category", lineId: "line-decor", moveToLineId: "line-venue" },
  { type: "set_budget_note", lineId: "line-decor", note: "Pastel" },
  { type: "set_total_budget", total: 2_000_000, strategy: "rescale" },
  { type: "set_budget_lines", lines: plan.budget.lines.map((line) => ({ lineId: line.id, amount: line.amount })) },
  { type: "add_function", name: "Cocktail night", date: "2026-12-26", sharePercent: 10, startTime: "20:00", endTime: "23:00" },
  { type: "move_function", functionId: "fn-sangeet", date: "2026-12-25", startTime: "19:00", endTime: "23:00" },
  { type: "set_function_share", functionId: "fn-sangeet", percent: 20 },
  { type: "add_task", title: "Book dhol", category: "Entertainment", daysBefore: 30, functionId: "fn-sangeet" },
  { type: "add_task", title: "Thank-you calls", category: "Guests", daysBefore: -3, functionId: null },
  { type: "update_task", taskId: "task-book-decorator", title: "Book decorator", category: "Decor", daysBefore: 55, done: false },
  {
    type: "add_vendor",
    category: "Photo booth",
    budgetLineId: "line-entertainment",
    functionIds: ["fn-sangeet"],
    bookByDaysBefore: 30,
    questions: ["Props?"],
  },
  {
    type: "update_vendor",
    vendorId: "vendor-decorator",
    patch: { budgetLineId: "line-decor", functionIds: [], questions: [], notes: "Pastels" },
  },
  { type: "set_vendor_status", vendorId: "vendor-mehndi-artist", status: "booked", quotedAmount: 45_000, paidAmount: 0 },
  {
    type: "add_idea",
    idea: {
      title: "Dhol entry",
      description: "Dhol",
      category: "entertainment",
      estimatedCost: 20_000,
      costBasis: "per event",
      basis: ["x"],
      effort: "vendor",
    },
  },
  { type: "set_guests", guests: { total: 350, kids: 30, elderly: 40 } },
  { type: "set_details", eventDate: "2027-01-03" },
];

describe("edit forms (spec 6.1 table)", () => {
  it.each(ROUND_TRIP.map((op) => [op.type, op] as const))("%s rebuilds a faithful op from its starting values", (_, op) => {
    const result = form(op).build(form(op).values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(isFaithfulEdit(op, result.op)).toBe(true);
  });

  it("has no form for ops that are accepted or declined as they are", () => {
    for (const op of [
      { type: "remove_task", taskId: "x" },
      { type: "remove_function", functionId: "x" },
      { type: "reset_section", section: "ideas" },
      { type: "set_details", city: "Pune" },
    ] satisfies PlanOperation[]) {
      expect(editFormFor(op, plan, TODAY)).toBeNull();
    }
  });

  it("changes only the editable fields and reports field errors", () => {
    const cut: PlanOperation = {
      type: "adjust_budget_category",
      lineId: "line-decor",
      mode: "percent_change",
      value: -20,
      rebalance: "change_total",
    };
    expect(built(cut, { mode: "set_amount", value: "2,50,000", rebalance: "to_contingency" })).toEqual({
      ok: true,
      op: { ...cut, mode: "set_amount", value: 250_000, rebalance: "to_contingency" },
    });
    expect(built(cut, { value: "" })).toEqual({ ok: false, errors: { value: "Enter a value" } });
    const idea = ROUND_TRIP.find((op) => op.type === "add_idea")!;
    const blank = built(idea, { title: "", estimatedCost: "" });
    expect(blank).toEqual({ ok: false, errors: { title: "Enter a name" } });
    expect(built(idea, { estimatedCost: "" })).toMatchObject({ ok: true, op: { idea: { estimatedCost: null } } });
    expect(built({ type: "set_guests", guests: { total: 350 } }, { kids: "", total: "0" })).toMatchObject({
      ok: false,
      errors: { total: expect.any(String) },
    });
    const lines = ROUND_TRIP.find((op) => op.type === "set_budget_lines")!;
    expect(built(lines, { "line-decor": "" })).toEqual({ ok: false, errors: { "line-decor": "Enter a value" } });
    expect(
      built(
        { type: "add_vendor", category: "X", bookByDaysBefore: 30 },
        { questions: Array.from({ length: 9 }, (_, i) => `q${i}`).join("\n") },
      ),
    ).toMatchObject({ ok: false, errors: { questions: expect.any(String) } });
    expect(
      built(
        { type: "update_vendor", vendorId: "vendor-decorator", patch: {} },
        { questions: Array.from({ length: 9 }, (_, i) => `q${i}`).join("\n") },
      ),
    ).toMatchObject({ ok: false, errors: { questions: expect.any(String) } });
  });

  it("switches a task between days before, after and a date", () => {
    const op: PlanOperation = { type: "add_task", title: "Call caterer", category: "General", daysBefore: 30 };
    const f = form(op);
    expect(visibleFields(f.fields, f.values).map((field) => field.name)).toEqual(["title", "category", "functionId", "dueMode", "days"]);
    expect(f.build({ ...f.values, dueMode: "after", days: "2" })).toMatchObject({ ok: true, op: { daysBefore: -2 } });
    expect(f.build({ ...f.values, dueMode: "date", date: "2026-12-01" })).toMatchObject({ ok: true, op: { date: "2026-12-01" } });
    expect(f.build({ ...f.values, days: "" })).toEqual({ ok: false, errors: { days: "Enter a value" } });
    const pinned = form({ type: "update_task", taskId: "task-book-decorator", date: "2026-12-01" });
    expect(pinned.values).toMatchObject({ dueMode: "date", date: "2026-12-01" });
    expect(form({ type: "update_task", taskId: "task-book-decorator" }).values).toMatchObject({
      title: "Book decorator",
      days: "55",
      done: "no",
    });
    expect(form({ type: "add_task", title: "x", category: "General" }).values.days).toBe("30");
  });

  it("pre-fills from the plan where the op leaves fields out", () => {
    expect(form({ type: "move_function", functionId: "fn-sangeet", weekday: "friday" }).values).toMatchObject({
      date: "2026-12-26",
      startTime: "19:00",
    });
    expect(form({ type: "add_function", name: "Mehendi brunch" }).values).toMatchObject({ date: "2026-12-27", sharePercent: "10" });
    expect(form({ type: "set_vendor_status", vendorId: "vendor-venue", status: "paid" }).values).toMatchObject({
      quotedAmount: "450000",
      paidAmount: "100000",
    });
    expect(form({ type: "set_vendor_status", vendorId: "vendor-gone", status: "paid" }).values).toMatchObject({
      quotedAmount: "",
      paidAmount: "",
    });
    expect(built({ type: "set_vendor_status", vendorId: "vendor-gone", status: "contacted" })).toMatchObject({
      ok: true,
      op: { status: "contacted" },
    });
    expect(form({ type: "remove_budget_category", lineId: "line-decor" }).values.moveToLineId).toBe("line-contingency");
    expect(form({ type: "update_idea", ideaId: "idea-fusion-haldi", patch: {} }).values).toMatchObject({
      title: "Fusion haldi",
      estimatedCost: "15000",
    });
    expect(built({ type: "update_idea", ideaId: "idea-fusion-haldi", patch: {} })).toMatchObject({
      ok: true,
      op: { type: "update_idea", patch: { title: "Fusion haldi" } },
    });
    const noFunctions = { ...plan, functions: [] };
    expect(form({ type: "add_vendor", category: "X", bookByDaysBefore: 1 }, noFunctions).fields.map((f) => f.name)).not.toContain(
      "functionIds",
    );
    expect(form({ type: "set_guests", guests: { kids: null } }).values.kids).toBe("");
  });

  it("computes a task's due date for the live preview", () => {
    expect(opDueDate({ daysBefore: 7 }, "2026-12-27")).toBe("2026-12-20");
    expect(opDueDate({ date: "2026-12-01" }, "2026-12-27")).toBe("2026-12-01");
    expect(opDueDate({}, "2026-12-27")).toBeNull();
  });
});
