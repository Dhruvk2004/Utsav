import { CAPS, type EventDoc, type VendorDoc } from "../model/event";
import type { VendorStatus } from "../model/enums";
import { defined, fail, findById, itemOrigin, stampOf, uniqueId, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/** Vendor ops (spec 5.6). Labels and contacts are the user's own; AI can never write them. */

function checkLinks(plan: EventDoc, budgetLineId: string | null | undefined, functionIds: string[] | undefined): void {
  if (budgetLineId) findById(plan.budget.lines, budgetLineId, "Budget category");
  for (const id of functionIds ?? []) findById(plan.functions, id, "Function");
}

/** Invariant 6: booked and paid need a quote; paid needs a payment. */
function checkAmounts(vendor: VendorDoc): void {
  if ((vendor.status === "booked" || vendor.status === "paid") && vendor.quotedAmount === null) {
    fail(`Add the quoted amount for ${vendor.category} first`);
  }
  if (vendor.status === "paid" && vendor.paidAmount <= 0) fail(`Add the amount paid to ${vendor.category}`);
}

function pushHistory(vendor: VendorDoc, status: VendorStatus, ctx: ApplyContext): void {
  vendor.history = [...vendor.history, { status, at: stampOf(ctx) }].slice(-CAPS.vendorHistory);
}

export function addVendor(plan: EventDoc, op: OpOf<"add_vendor">, ctx: ApplyContext): void {
  if (plan.vendors.length >= CAPS.vendors) fail(`A plan can have at most ${CAPS.vendors} vendors`);
  checkLinks(plan, op.budgetLineId, op.functionIds);
  const vendor: VendorDoc = {
    id: uniqueId(
      "vendor",
      op.category,
      plan.vendors.map((v) => v.id),
    ),
    category: op.category,
    label: "",
    budgetLineId: op.budgetLineId ?? null,
    functionIds: [...new Set(op.functionIds ?? [])],
    bookByDaysBefore: op.bookByDaysBefore,
    status: "to_research",
    quotedAmount: null,
    paidAmount: 0,
    notes: "",
    contact: "",
    questions: op.questions ?? [],
    history: [],
    drafts: [],
    origin: itemOrigin(ctx),
  };
  pushHistory(vendor, vendor.status, ctx);
  plan.vendors.push(vendor);
}

export function updateVendor(plan: EventDoc, op: OpOf<"update_vendor">, ctx: ApplyContext): void {
  const vendor = findById(plan.vendors, op.vendorId, "Vendor");
  const { patch } = op;
  if (ctx.actor === "ai" && (patch.label !== undefined || patch.contact !== undefined)) {
    fail("Vendor names and contacts can only be entered by you");
  }
  checkLinks(plan, patch.budgetLineId, patch.functionIds);
  const textChanged = [patch.label, patch.notes, patch.questions, patch.contact].some((v) => v !== undefined);
  Object.assign(vendor, defined(patch));
  if (patch.functionIds) vendor.functionIds = [...new Set(patch.functionIds)];
  if (textChanged) vendor.origin = itemOrigin(ctx);
  checkAmounts(vendor);
}

export function setVendorStatus(plan: EventDoc, op: OpOf<"set_vendor_status">, ctx: ApplyContext): void {
  const vendor = findById(plan.vendors, op.vendorId, "Vendor");
  if (op.quotedAmount !== undefined) vendor.quotedAmount = op.quotedAmount;
  if (op.paidAmount !== undefined) vendor.paidAmount = op.paidAmount;
  const changed = vendor.status !== op.status;
  vendor.status = op.status;
  checkAmounts(vendor);
  if (changed) pushHistory(vendor, op.status, ctx);
}

export function removeVendor(plan: EventDoc, op: OpOf<"remove_vendor">, ctx: ApplyContext): void {
  const vendor = findById(plan.vendors, op.vendorId, "Vendor");
  if (ctx.actor === "ai" && (vendor.status === "booked" || vendor.status === "paid")) {
    fail(`${vendor.category} is ${vendor.status}; mark it not needed instead`);
  }
  plan.vendors = plan.vendors.filter((v) => v.id !== vendor.id);
}

export function saveDraft(plan: EventDoc, op: OpOf<"save_draft">, ctx: ApplyContext): void {
  const vendor = findById(plan.vendors, op.vendorId, "Vendor");
  if (vendor.drafts.length >= CAPS.drafts) fail(`Keep at most ${CAPS.drafts} drafts per vendor; remove one first`);
  const generated = op.generatedDraftId && ctx.draftOrigin?.(vendor.id, op.generatedDraftId, op.draft.body);
  vendor.drafts.push({
    id: uniqueId(
      "draft",
      `${vendor.category} ${vendor.drafts.length + 1}`,
      vendor.drafts.map((d) => d.id),
    ),
    ...op.draft,
    createdAt: stampOf(ctx),
    origin: generated || "user",
  });
}

export function removeDraft(plan: EventDoc, op: OpOf<"remove_draft">): void {
  const vendor = findById(plan.vendors, op.vendorId, "Vendor");
  findById(vendor.drafts, op.draftId, "Draft");
  vendor.drafts = vendor.drafts.filter((d) => d.id !== op.draftId);
}
