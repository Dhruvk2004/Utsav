import { daysBetween } from "@/lib/domain/dates";
import { functionWhen } from "@/lib/domain/describe";
import type { EventDoc, FunctionDoc } from "@/lib/domain/model/event";
import { PHASES, phaseFor } from "@/lib/domain/timeline";
import type { PlanView, TaskView } from "@/lib/domain/view";

/**
 * Timeline groups (spec 5.5, design-system 9.1 phase rule): tasks by phase, with function days as
 * milestones. Functions on the event day or the day after sit in the event-day group ("Event
 * days" when it holds more than one); "After the event" holds tasks only.
 */

export const TASK_FILTERS = ["all", "todo", "done", "overdue"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];
export const TASK_FILTER_LABELS: Record<TaskFilter, string> = { all: "All", todo: "To do", done: "Done", overdue: "Overdue" };

export type TimelineEntry =
  { kind: "task"; date: string; task: TaskView } | { kind: "function"; date: string; fn: FunctionDoc; when: string };

export interface TimelineGroup {
  id: string;
  label: string;
  entries: TimelineEntry[];
}

const matches = (task: TaskView, filter: TaskFilter) =>
  filter === "all" || (filter === "todo" && !task.done) || (filter === "done" && task.done) || (filter === "overdue" && task.overdue);

function functionPhase(fn: FunctionDoc, eventDate: string): string {
  const daysBefore = daysBetween(fn.date, eventDate);
  return daysBefore <= 0 ? "day" : phaseFor(daysBefore).id;
}

export function timelineGroups(plan: EventDoc, view: PlanView, filter: TaskFilter, functionId: string | null): TimelineGroup[] {
  const { eventDate } = plan.details;
  const tasks = view.tasks.filter((task) => matches(task, filter) && (functionId === null || task.functionId === functionId));
  const functions = plan.functions.filter((fn) => functionId === null || fn.id === functionId);
  return PHASES.map((phase) => {
    const fnEntries = functions
      .filter((fn) => functionPhase(fn, eventDate) === phase.id)
      .map((fn): TimelineEntry => ({ kind: "function", date: fn.date, fn, when: functionWhen(fn) }));
    const taskEntries = tasks
      .filter((task) => task.phaseId === phase.id)
      .map((task): TimelineEntry => ({ kind: "task", date: task.dueDate, task }));
    const entries = [...fnEntries, ...taskEntries].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "function" ? -1 : 1));
    const label = phase.id === "day" && fnEntries.length > 1 ? "Event days" : phase.label;
    return { id: phase.id, label, entries };
  }).filter((group) => group.entries.length > 0);
}
