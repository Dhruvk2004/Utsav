import { addDays, daysBetween } from "./dates";
import { nearestFestival, type FestivalProximity } from "./festivals";
import { moneyByLine, moneyOf, type MoneySummary } from "./money";
import type { EventDoc, TaskDoc, VendorDoc } from "./model/event";
import { planWarnings } from "./planner";
import { idealDueDate } from "./stats";
import { dueDateFor, phaseFor, progress } from "./timeline";

export interface TaskView extends TaskDoc {
  /** Clamped into [today, eventDate + 7]. */
  dueDate: string;
  /** The ideal date had already passed, so the task was pulled forward to today. */
  rushed: boolean;
  overdue: boolean;
  phaseId: string;
}

export interface VendorView extends VendorDoc {
  bookBy: string;
  rushed: boolean;
}

export interface PlanView {
  daysToGo: number;
  festival: FestivalProximity | null;
  tasks: TaskView[];
  vendors: VendorView[];
  money: MoneySummary;
  moneyByLine: Map<string, MoneySummary>;
  progress: { done: number; total: number; percent: number };
  warnings: string[];
}

const SETTLED: ReadonlySet<VendorDoc["status"]> = new Set(["booked", "paid", "not_needed"]);

function taskView(task: TaskDoc, eventDate: string, today: string): TaskView {
  const ideal = idealDueDate(task, eventDate);
  const { dueDate, rushed } = dueDateFor(eventDate, today, daysBetween(ideal, eventDate));
  return { ...task, dueDate, rushed, overdue: rushed && !task.done, phaseId: phaseFor(daysBetween(dueDate, eventDate)).id };
}

function vendorView(vendor: VendorDoc, eventDate: string, today: string): VendorView {
  const ideal = addDays(eventDate, -vendor.bookByDaysBefore);
  const late = ideal < today && !SETTLED.has(vendor.status);
  return { ...vendor, bookBy: late ? today : ideal, rushed: late };
}

/**
 * Everything the workspace renders that is derived rather than stored: due dates, rushed
 * flags, money, progress and warnings. Pure, so the server, the share page and the demo agree.
 */
export function deriveView(plan: EventDoc, today: string): PlanView {
  const { eventDate } = plan.details;
  const tasks = plan.tasks
    .map((task) => taskView(task, eventDate, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  const vendors = plan.vendors
    .map((vendor) => vendorView(vendor, eventDate, today))
    .sort((a, b) => a.bookBy.localeCompare(b.bookBy) || a.category.localeCompare(b.category));
  const done = new Set(plan.tasks.filter((task) => task.done).map((task) => task.id));

  return {
    daysToGo: daysBetween(today, eventDate),
    festival: nearestFestival(eventDate),
    tasks,
    vendors,
    money: moneyOf(plan),
    moneyByLine: moneyByLine(plan),
    progress: progress(
      done,
      plan.tasks.map((task) => task.id),
    ),
    warnings: planWarnings(
      { budget: plan.budget.total, guestCount: plan.guests.total, eventDate },
      { timeline: tasks.filter((task) => !task.done), vendors },
    ),
  };
}
