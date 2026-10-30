import { z } from "zod";
import { formatInr } from "@/lib/domain/budget";
import { IDEA_CATEGORIES } from "@/lib/domain/model/enums";
import type { ProposalDraftItem } from "./proposals";

/**
 * A Smart re-plan (spec 6.4) as the model returns it and the recordings store it: new weights for
 * existing categories, up to 5 notes and up to 4 trade-offs. Code maps the lines to the plan
 * (`smartRows`) and turns trade-offs into `add_idea` / `add_task` proposal items.
 */

export const smartReplySchema = z.object({
  lines: z
    .array(z.object({ category: z.string().min(1).max(80), percent: z.number().min(0).max(100) }))
    .min(1)
    .max(30),
  notes: z.array(z.string().max(200)).max(5).default([]),
  tradeoffs: z
    .array(
      z.object({
        kind: z.enum(["idea", "task"]),
        title: z.string().min(1).max(80),
        detail: z.string().max(300),
        category: z.string().min(1).max(40).describe("The budget category it affects"),
        estimatedCost: z.number().int().min(0).optional(),
        daysBefore: z.number().int().min(0).max(730).optional(),
      }),
    )
    .max(4)
    .default([]),
});
export type SmartReply = z.output<typeof smartReplySchema>;
export type Tradeoff = SmartReply["tradeoffs"][number];

/** A trade-off as a proposal item: an idea (decor, food …) or a task in the affected category. */
/**
 * The stored instruction of a What-if trade-off proposal: the new total and anything the user
 * added, so a trade-off restored in AI mode says what it came from (MQR-04).
 */
export function whatifInstruction(newTotal: number, ask: string): string {
  const total = `New total ${formatInr(newTotal)}`;
  return (ask.trim() ? `${total}: ${ask.trim()}` : total).slice(0, 500);
}

export function tradeoffItem(tradeoff: Tradeoff): ProposalDraftItem {
  const rationale = tradeoff.detail.slice(0, 160);
  if (tradeoff.kind === "task") {
    return {
      op: { type: "add_task", title: tradeoff.title, category: tradeoff.category, daysBefore: tradeoff.daysBefore ?? 14 },
      rationale,
    };
  }
  const category = IDEA_CATEGORIES.find((c) => c === tradeoff.category.toLowerCase()) ?? "experience";
  const idea = {
    title: tradeoff.title,
    description: tradeoff.detail,
    category,
    estimatedCost: tradeoff.estimatedCost ?? null,
    costBasis: "per event" as const,
    basis: [],
    effort: "vendor" as const,
  };
  return { op: { type: "add_idea", idea }, rationale };
}
