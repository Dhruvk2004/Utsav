import { addDays, daysBetween, formatDisplayDate } from "../dates";
import { CAPS, type EventDoc, type TaskDoc } from "../model/event";
import { LIMITS } from "../schemas";
import { fail, findById, itemOrigin, stampOf, uniqueId, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/** Task ops (spec 5.5). Tasks are stored relative to the event (`daysBefore`), or pinned to a date. */

/** Converts an absolute due date into a pin, checking it lies in [today, eventDate + 7]. */
function pinFor(plan: EventDoc, date: string, today: string): Pick<TaskDoc, "pinnedDate" | "daysBefore"> {
  const latest = addDays(plan.details.eventDate, -LIMITS.minDaysBefore);
  if (date < today) fail("Pick a date from today onwards");
  if (date > latest) fail(`Tasks must be due by ${formatDisplayDate(latest)}, a week after the event`);
  const daysBefore = daysBetween(date, plan.details.eventDate);
  if (daysBefore > LIMITS.maxPlanningDays) fail("Pick a date within two years of the event");
  return { pinnedDate: date, daysBefore };
}

function checkFunctionLink(plan: EventDoc, functionId: string | null): void {
  if (functionId !== null) findById(plan.functions, functionId, "Function");
}

export function addTask(plan: EventDoc, op: OpOf<"add_task">, ctx: ApplyContext): void {
  if (plan.tasks.length >= CAPS.tasks) fail(`A plan can have at most ${CAPS.tasks} tasks`);
  const functionId = op.functionId ?? null;
  checkFunctionLink(plan, functionId);
  let due: Pick<TaskDoc, "pinnedDate" | "daysBefore">;
  if (op.date !== undefined) due = pinFor(plan, op.date, ctx.today);
  else if (op.daysBefore !== undefined) due = { pinnedDate: null, daysBefore: op.daysBefore };
  else fail("Give a due date or the number of days before the event");

  plan.tasks.push({
    id: uniqueId(
      "task",
      op.title,
      plan.tasks.map((t) => t.id),
    ),
    title: op.title,
    category: op.category,
    ...due,
    functionId,
    done: false,
    doneAt: null,
    origin: itemOrigin(ctx),
  });
}

export function updateTask(plan: EventDoc, op: OpOf<"update_task">, ctx: ApplyContext): void {
  const task = findById(plan.tasks, op.taskId, "Task");
  if (op.title !== undefined || op.category !== undefined) {
    task.title = op.title ?? task.title;
    task.category = op.category ?? task.category;
    task.origin = itemOrigin(ctx);
  }
  if (op.daysBefore !== undefined) Object.assign(task, { daysBefore: op.daysBefore, pinnedDate: null });
  if (op.date === null) task.pinnedDate = null;
  else if (op.date !== undefined) Object.assign(task, pinFor(plan, op.date, ctx.today));
  if (op.done !== undefined && op.done !== task.done) {
    task.done = op.done;
    task.doneAt = op.done ? stampOf(ctx) : null;
  }
}

export function removeTask(plan: EventDoc, op: OpOf<"remove_task">): void {
  findById(plan.tasks, op.taskId, "Task");
  plan.tasks = plan.tasks.filter((t) => t.id !== op.taskId);
}
