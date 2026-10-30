import { addDays } from "./dates";
import { moneyOf } from "./money";
import { VENDOR_STATUSES } from "./model/enums";
import type { EventDoc, PlanStats, TaskDoc } from "./model/event";

/** The ideal (unclamped) due date of a task: its pin, or its offset from the event day. */
export function idealDueDate(task: Pick<TaskDoc, "pinnedDate" | "daysBefore">, eventDate: string): string {
  return task.pinnedDate ?? addDays(eventDate, -task.daysBefore);
}

/**
 * The denormalised dashboard block (spec 8.2). It does not depend on today: overdue and
 * due-this-week are computed on read from `openDueDates`. `pending` is owned by the proposal handlers.
 */
export function computeStats(plan: EventDoc): Omit<PlanStats, "pending"> {
  const open = plan.tasks.filter((task) => !task.done);
  const vendorsByStatus = Object.fromEntries(VENDOR_STATUSES.map((status) => [status, 0])) as PlanStats["vendorsByStatus"];
  for (const vendor of plan.vendors) vendorsByStatus[vendor.status] += 1;
  return {
    tasksDone: plan.tasks.length - open.length,
    tasksTotal: plan.tasks.length,
    openDueDates: open.map((task) => idealDueDate(task, plan.details.eventDate)).sort(),
    vendorsByStatus,
    committed: moneyOf(plan).committed,
  };
}
