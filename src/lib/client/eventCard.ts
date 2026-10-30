import type { EventSummary } from "@/lib/data/eventsRepository";
import { formatCount, formatInr } from "@/lib/domain/budget";
import { addDays, daysBetween, formatWeekdayDate } from "@/lib/domain/dates";
import { defaultEventTitle, EVENT_TYPE_LABELS } from "@/lib/domain/labels";
import type { EventType } from "@/lib/domain/schemas";

/** Everything a dashboard card shows, computed from the summary projection and today's date. */
export interface EventCardView {
  id: string;
  eventType: EventType;
  typeLabel: string;
  title: string;
  countdown: string;
  meta: string;
  budget: string;
  tasksPercent: number;
  tasksText: string;
  /** "3 vendors booked · 2 due this week", or the overdue count as a warning. */
  signal: { text: string; tone: "default" | "danger" } | null;
  pendingText: string | null;
  fromTemplate: boolean;
}

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

export function countdownText(eventDate: string, today: string): string {
  const days = daysBetween(today, eventDate);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 1 ? `${days} days to go` : `${-days} days ago`;
}

function signalOf({ stats }: EventSummary, today: string): EventCardView["signal"] {
  const overdue = stats.openDueDates.filter((d) => d < today).length;
  if (overdue > 0) return { text: plural(overdue, "overdue task", "overdue tasks"), tone: "danger" };
  const weekEnd = addDays(today, 6);
  const dueThisWeek = stats.openDueDates.filter((d) => d >= today && d <= weekEnd).length;
  const booked = stats.vendorsByStatus.booked + stats.vendorsByStatus.paid;
  const parts = [
    booked > 0 ? plural(booked, "vendor booked", "vendors booked") : null,
    dueThisWeek > 0 ? `${dueThisWeek} due this week` : null,
  ].filter((p): p is string => p !== null);
  return parts.length ? { text: parts.join(" · "), tone: "default" } : null;
}

export function eventCardView(summary: EventSummary, today: string): EventCardView {
  const { details, stats } = summary;
  const tasksPercent = stats.tasksTotal ? Math.round((stats.tasksDone / stats.tasksTotal) * 100) : 0;
  const pending = stats.pending.count;
  return {
    id: summary.id,
    eventType: details.eventType,
    typeLabel: EVENT_TYPE_LABELS[details.eventType],
    title: details.title || defaultEventTitle(details),
    countdown: countdownText(details.eventDate, today),
    meta: [formatWeekdayDate(details.eventDate), details.city, plural(summary.guests, "guest", "guests")].join(" · "),
    budget: formatInr(summary.budgetTotal),
    tasksPercent,
    tasksText: `${tasksPercent}% of tasks done`,
    signal: signalOf(summary, today),
    pendingText: pending > 0 ? plural(pending, "suggestion waiting", "suggestions waiting") : null,
    fromTemplate: summary.source === "template",
  };
}

/** Upcoming events soonest first and past events most recent first; archived events are a P1 tab. */
export function splitEvents(summaries: EventSummary[], today: string): { upcoming: EventSummary[]; past: EventSummary[] } {
  const active = summaries.filter((s) => s.status === "active");
  const byDate = (a: EventSummary, b: EventSummary) => a.details.eventDate.localeCompare(b.details.eventDate);
  return {
    upcoming: active.filter((s) => s.details.eventDate >= today).sort(byDate),
    past: active.filter((s) => s.details.eventDate < today).sort((a, b) => byDate(b, a)),
  };
}
