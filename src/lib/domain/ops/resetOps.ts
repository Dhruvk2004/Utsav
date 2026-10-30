import { allocate, rebalancePinned } from "../budget";
import { committedByLine } from "../money";
import { CAPS, type BudgetLineDoc, type EventDoc, type VendorDoc } from "../model/event";
import { templateDraft } from "../template";
import { fail, nameKey, normaliseTitle, stampOf, uniqueId, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/**
 * `reset_section` (spec 6.2): replaces the AI-written part of one section with the starter
 * template for the same event, keeping everything the user added, edited, booked or finished.
 */

function starter(plan: EventDoc) {
  const { details, guests, budget, functions } = plan;
  return templateDraft(
    {
      eventType: details.eventType,
      title: details.title,
      eventDate: details.eventDate,
      city: details.city,
      guestCount: guests.total,
      budget: budget.total,
      vibe: details.vibe,
      functions: functions.map((fn) => fn.name),
      language: details.language,
    },
    details.occasion,
  );
}

function resetBudget(plan: EventDoc): void {
  const split = starter(plan).budget;
  const amounts = allocate(
    plan.budget.total,
    split.map((line) => line.percent),
  );
  const oldById = new Map(plan.budget.lines.map((line) => [line.id, line]));
  const taken: string[] = [];
  const lines: BudgetLineDoc[] = split.map((item, i) => {
    const same = plan.budget.lines.find((line) => nameKey(line.category) === nameKey(item.category));
    const id = same?.id ?? uniqueId("line", item.category, [...taken, ...oldById.keys()]);
    taken.push(id);
    return { id, category: item.category, amount: amounts[i], percent: 0, note: item.note, origin: "code" };
  });

  // Vendors follow their category by name, else Contingency (invariant 11).
  const fallback = lines.find((line) => nameKey(line.category) === "contingency") ?? lines[0];
  for (const vendor of plan.vendors) {
    if (vendor.budgetLineId === null) continue;
    const oldName = nameKey(oldById.get(vendor.budgetLineId)?.category ?? "");
    vendor.budgetLineId = (lines.find((line) => nameKey(line.category) === oldName) ?? fallback).id;
  }

  // No line may drop below what booked vendors already committed on it.
  const committed = committedByLine({ ...plan, budget: { ...plan.budget, lines } });
  const pins = Object.fromEntries(
    lines.filter((line) => (committed.get(line.id) ?? 0) > line.amount).map((line) => [line.id, committed.get(line.id) ?? 0]),
  );
  plan.budget.lines = rebalancePinned(lines, pins, plan.budget.total) ?? fail("Booked vendors already exceed the budget");
}

function resetTimeline(plan: EventDoc): void {
  const kept = plan.tasks.filter((task) => task.origin !== "ai" || task.done);
  const titles = new Set(kept.map((task) => normaliseTitle(task.title)));
  for (const task of starter(plan).tasks) {
    if (kept.length >= CAPS.tasks || titles.has(normaliseTitle(task.title))) continue;
    titles.add(normaliseTitle(task.title));
    kept.push({
      ...task,
      id: uniqueId(
        "task",
        task.title,
        kept.map((t) => t.id),
      ),
      pinnedDate: null,
      functionId: null,
      done: false,
      doneAt: null,
      origin: "code",
    });
  }
  plan.tasks = kept;
}

function resetVendors(plan: EventDoc, ctx: ApplyContext): void {
  const untouched = (v: VendorDoc) =>
    v.origin === "ai" && v.status === "to_research" && !v.notes && v.quotedAmount === null && v.paidAmount === 0 && v.drafts.length === 0;
  const kept = plan.vendors.filter((vendor) => !untouched(vendor));
  const categories = new Set(kept.map((vendor) => nameKey(vendor.category)));
  for (const vendor of starter(plan).vendors) {
    if (kept.length >= CAPS.vendors || categories.has(nameKey(vendor.category))) continue;
    categories.add(nameKey(vendor.category));
    kept.push({
      ...vendor,
      id: uniqueId(
        "vendor",
        vendor.category,
        kept.map((v) => v.id),
      ),
      label: "",
      budgetLineId: null,
      functionIds: [],
      status: "to_research",
      quotedAmount: null,
      paidAmount: 0,
      notes: "",
      contact: "",
      history: [{ status: "to_research", at: stampOf(ctx) }],
      drafts: [],
      origin: "code",
    });
  }
  plan.vendors = kept;
}

export function resetSection(plan: EventDoc, op: OpOf<"reset_section">, ctx: ApplyContext): void {
  if (ctx.proposalOrigin !== "code") fail("Only Utsav's starter template can reset a section");
  if (op.section === "budget") resetBudget(plan);
  else if (op.section === "timeline") resetTimeline(plan);
  else if (op.section === "vendors") resetVendors(plan, ctx);
  else plan.ideas = plan.ideas.filter((idea) => idea.state !== "suggested");
  if (plan.review) plan.review[op.section] = "reset";
}
