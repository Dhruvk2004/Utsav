import { daysBetween, formatDisplayDate, validateEventDate } from "@/lib/domain/dates";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { OpOf } from "@/lib/domain/ops/schema";
import type { Language } from "@/lib/domain/schemas";
import { deriveView } from "@/lib/domain/view";

/**
 * Event settings (spec 5.9): the details form as data, the `set_details` op it saves, and the
 * date-change preview, computed by dry-running the same op the save will apply, so the preview
 * and the result can never disagree.
 */

export interface DetailsForm {
  title: string;
  eventDate: string;
  city: string;
  language: Language;
}

export const detailsFormOf = (plan: EventDoc): DetailsForm => ({
  title: plan.details.title,
  eventDate: plan.details.eventDate,
  city: plan.details.city,
  language: plan.details.language,
});

export function detailsIssues(form: DetailsForm, today: string): Partial<Record<keyof DetailsForm, string>> {
  const issues: Partial<Record<keyof DetailsForm, string>> = {};
  if (form.title.length > 80) issues.title = "Keep the name to 80 characters.";
  if (!form.city.trim()) issues.city = "Add the city.";
  const dateProblem = /^\d{4}-\d{2}-\d{2}$/.test(form.eventDate) ? validateEventDate(form.eventDate, today) : "Pick a date.";
  if (dateProblem) issues.eventDate = dateProblem.endsWith(".") ? dateProblem : `${dateProblem}.`;
  return issues;
}

/** Only the fields that changed, or null when nothing did. */
export function detailsOp(plan: EventDoc, form: DetailsForm): OpOf<"set_details"> | null {
  const before = detailsFormOf(plan);
  const changed = (Object.keys(form) as (keyof DetailsForm)[]).filter((key) => form[key].trim() !== before[key]);
  if (changed.length === 0) return null;
  return { type: "set_details", ...Object.fromEntries(changed.map((key) => [key, form[key].trim()])) };
}

export interface DatePreview {
  /** Whole days the event moves (negative is earlier). */
  shift: number;
  tasksMoved: number;
  /** Open tasks that become rushed (their ideal date would already have passed). */
  newlyRushed: number;
  functionsShifted: number;
  /** Why the new date cannot be used, when the dry run refuses it. */
  problem: string | null;
}

export function datePreview(plan: EventDoc, eventDate: string, today: string): DatePreview | null {
  if (eventDate === plan.details.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const shift = daysBetween(plan.details.eventDate, eventDate);
  const run = applyOperations(plan, [{ type: "set_details", eventDate }], { today, actor: "user" });
  const [result] = run.results;
  if (!result.ok) return { shift, tasksMoved: 0, newlyRushed: 0, functionsShifted: 0, problem: result.reason };
  const before = new Map(deriveView(plan, today).tasks.map((task) => [task.id, task]));
  const after = deriveView(run.plan, today).tasks.filter((task) => !task.done);
  return {
    shift,
    tasksMoved: after.filter((task) => before.get(task.id)?.dueDate !== task.dueDate).length,
    newlyRushed: after.filter((task) => task.rushed && !before.get(task.id)?.rushed).length,
    functionsShifted: plan.functions.length,
    problem: null,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Moves the event 7 days later to 21 Dec 2026: 18 tasks move, 2 become rushed, 5 functions shift by the same 7 days." */
export function datePreviewText(preview: DatePreview, eventDate: string): string {
  if (preview.problem) return preview.problem;
  const days = Math.abs(preview.shift);
  const direction = `${plural(days, "day")} ${preview.shift > 0 ? "later" : "earlier"}`;
  const parts = [`${plural(preview.tasksMoved, "task")} move`];
  if (preview.newlyRushed > 0) parts.push(`${preview.newlyRushed} become rushed`);
  if (preview.functionsShifted > 0) parts.push(`${plural(preview.functionsShifted, "function")} shift by the same ${plural(days, "day")}`);
  return `Moves the event ${direction} to ${formatDisplayDate(eventDate)}: ${parts.join(", ")}.`;
}
