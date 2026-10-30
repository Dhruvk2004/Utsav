import { formatInr } from "@/lib/domain/budget";
import { VENDOR_STATUSES, type VendorStatus } from "@/lib/domain/model/enums";
import type { EventDoc, VendorDoc } from "@/lib/domain/model/event";
import type { OpOf } from "@/lib/domain/ops/schema";
import type { PlanView, VendorView } from "@/lib/domain/view";

/**
 * Vendors tab (spec 5.6, design-system 6.4): status groups, the inline amount prompt that
 * Booked and Paid need, and the "Paid more than quoted" warning (a warning, never a block).
 */

/** The five pipeline steps; Not needed sits outside them. */
export const PIPELINE: readonly VendorStatus[] = ["to_research", "contacted", "quoted", "booked", "paid"];

export interface VendorGroup {
  status: VendorStatus;
  vendors: VendorView[];
}

export function vendorGroups(view: PlanView, functionId: string | null): VendorGroup[] {
  const shown = view.vendors.filter((vendor) => functionId === null || vendor.functionIds.includes(functionId));
  return VENDOR_STATUSES.map((status) => ({ status, vendors: shown.filter((vendor) => vendor.status === status) }));
}

/** Which amounts the user must give before a status change can be saved. */
export function amountsNeeded(
  vendor: Pick<VendorDoc, "quotedAmount" | "paidAmount">,
  status: VendorStatus,
): { quote: boolean; paid: boolean } {
  return {
    quote: (status === "booked" || status === "paid") && vendor.quotedAmount === null,
    paid: status === "paid" && vendor.paidAmount <= 0,
  };
}

export function statusOp(
  vendorId: string,
  status: VendorStatus,
  amounts: { quoted?: number | null; paid?: number | null } = {},
): OpOf<"set_vendor_status"> {
  return {
    type: "set_vendor_status",
    vendorId,
    status,
    ...(amounts.quoted != null ? { quotedAmount: amounts.quoted } : {}),
    ...(amounts.paid != null ? { paidAmount: amounts.paid } : {}),
  };
}

/** "Paid ₹2,000 more than quoted", or null. */
export function overpaidText(vendor: Pick<VendorDoc, "quotedAmount" | "paidAmount">): string | null {
  const over = vendor.quotedAmount === null ? 0 : vendor.paidAmount - vendor.quotedAmount;
  return over > 0 ? `Paid ${formatInr(over)} more than quoted` : null;
}

/** 1-based step in the pipeline, or null for Not needed. */
export function pipelineStep(status: VendorStatus): number | null {
  const index = PIPELINE.indexOf(status);
  return index < 0 ? null : index + 1;
}

export function functionNames(plan: EventDoc, vendor: Pick<VendorDoc, "functionIds">): string[] {
  return vendor.functionIds.flatMap((id) => plan.functions.filter((fn) => fn.id === id).map((fn) => fn.name));
}
