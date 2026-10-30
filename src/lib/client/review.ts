import { formatInr } from "@/lib/domain/budget";
import { REVIEW_SECTION_LABELS } from "@/lib/domain/labels";
import { REVIEW_SECTIONS, type ReviewSection } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanView } from "@/lib/domain/view";

/**
 * "Review your new plan" banner (spec 6.2): one row per section with a code-built summary.
 * The banner shows while the plan has a review record with any section still pending.
 */

export interface ReviewRow {
  section: ReviewSection;
  label: string;
  summary: string;
  state: "pending" | "reviewed" | "reset";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function reviewSummary(section: ReviewSection, plan: EventDoc, view: PlanView): string {
  switch (section) {
    case "budget":
      return `${plural(plan.budget.lines.length, "category", "categories")}, ${formatInr(plan.budget.total)}`;
    case "timeline":
      return `${plural(plan.tasks.length, "task")}, ${view.tasks.filter((t) => t.rushed && !t.done).length} rushed`;
    case "vendors":
      return `${plural(plan.vendors.filter((v) => v.status === "to_research").length, "category", "categories")} to book`;
    case "ideas": {
      const waiting = plan.ideas.filter((idea) => idea.state === "suggested").length;
      return waiting > 0 ? `${plural(waiting, "idea")}, not saved yet` : "No ideas waiting";
    }
  }
}

export function reviewRows(plan: EventDoc, view: PlanView): ReviewRow[] {
  if (!plan.review) return [];
  const review = plan.review;
  return REVIEW_SECTIONS.map((section) => ({
    section,
    label: REVIEW_SECTION_LABELS[section],
    summary: reviewSummary(section, plan, view),
    state: review[section],
  }));
}

export function reviewPending(plan: EventDoc): boolean {
  return plan.review !== null && REVIEW_SECTIONS.some((section) => plan.review?.[section] === "pending");
}
