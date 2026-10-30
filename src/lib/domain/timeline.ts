import { addDays, daysBetween } from "./dates";
import type { TimelineTask, VendorItem } from "./schemas";

export type Phase = { id: string; label: string; minDays: number };

/** Planning phases, ordered from furthest out to the event itself. */
export const PHASES: Phase[] = [
  { id: "early", label: "3+ months before", minDays: 90 },
  { id: "months", label: "1–3 months before", minDays: 30 },
  { id: "weeks", label: "1–4 weeks before", minDays: 7 },
  { id: "final", label: "Final week", minDays: 1 },
  { id: "day", label: "Event day", minDays: 0 },
  { id: "after", label: "After the event", minDays: -7 },
];

export function phaseFor(daysBefore: number): Phase {
  return PHASES.find((p) => daysBefore >= p.minDays) ?? PHASES[PHASES.length - 1];
}

/** A stable id derived from content, so checkbox state survives re-renders and reloads. */
export function slugId(prefix: string, ...parts: (string | number)[]): string {
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${slug}`;
}

/**
 * The due date for a task `daysBefore` the event (negative = after it). A date that has
 * already passed is pulled forward to today and flagged as rushed, so due dates always
 * fall within [today, eventDate + 7].
 */
export function dueDateFor(eventDate: string, today: string, daysBefore: number): { dueDate: string; rushed: boolean } {
  const ideal = addDays(eventDate, -daysBefore);
  return ideal < today ? { dueDate: today, rushed: true } : { dueDate: ideal, rushed: false };
}

/**
 * Turns "N days before" offsets into real due dates. A task whose ideal date has
 * already passed is pulled forward to today and flagged as rushed.
 */
export function scheduleTasks(
  eventDate: string,
  today: string,
  tasks: { title: string; category: string; daysBefore: number }[],
): TimelineTask[] {
  const lead = daysBetween(today, eventDate);
  const seen = new Set<string>();

  return tasks
    .map((task) => {
      const { dueDate, rushed } = dueDateFor(eventDate, today, task.daysBefore);
      return {
        id: slugId("task", task.title, task.daysBefore),
        title: task.title.trim(),
        category: task.category.trim(),
        daysBefore: Math.min(task.daysBefore, lead),
        dueDate,
        rushed,
      };
    })
    .filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

export function scheduleVendors(
  eventDate: string,
  today: string,
  vendors: { category: string; bookByDaysBefore: number; questions: string[]; budgetCategory?: string | null }[],
): VendorItem[] {
  const lead = Math.max(0, daysBetween(today, eventDate));
  return vendors
    .map((vendor) => {
      const rushed = vendor.bookByDaysBefore > lead;
      return {
        id: slugId("vendor", vendor.category),
        category: vendor.category.trim(),
        bookBy: rushed ? today : addDays(eventDate, -vendor.bookByDaysBefore),
        bookByDaysBefore: vendor.bookByDaysBefore,
        rushed,
        questions: vendor.questions,
        budgetCategory: vendor.budgetCategory ?? null,
      };
    })
    .sort((a, b) => a.bookBy.localeCompare(b.bookBy) || a.category.localeCompare(b.category));
}

/** Groups tasks into phases, dropping empty phases. Days are counted to the event. */
export function groupByPhase(tasks: TimelineTask[], eventDate: string): { phase: Phase; tasks: TimelineTask[] }[] {
  return PHASES.map((phase) => ({
    phase,
    tasks: tasks.filter((t) => phaseFor(daysBetween(t.dueDate, eventDate)).id === phase.id),
  })).filter((group) => group.tasks.length > 0);
}

export function progress(doneIds: Set<string>, ids: string[]): { done: number; total: number; percent: number } {
  const done = ids.filter((id) => doneIds.has(id)).length;
  return { done, total: ids.length, percent: ids.length === 0 ? 0 : Math.round((done / ids.length) * 100) };
}
