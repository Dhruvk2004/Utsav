import { addDays } from "./dates";
import { defaultEventTitle } from "./labels";
import type { EventDoc } from "./model/event";
import { deriveView } from "./view";

/** Escapes text per RFC 5545 §3.3.11. Every line break (CRLF, a lone LF or a lone CR) becomes `\n` (SEC-11). */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets per RFC 5545 §3.1, without splitting multi-byte characters. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (iso: string) => iso.replace(/-/g, "");
const utcStamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** An India-time date and HH:mm as a UTC timestamp (IST is UTC+5:30, no daylight saving). */
export function istToUtc(date: string, time: string): string {
  return utcStamp(new Date(`${date}T${time}:00+05:30`));
}

interface CalendarItem {
  uid: string;
  summary: string;
  description: string;
  date: string;
  /** Timed items have both; otherwise the item is all-day. */
  start?: string | null;
  end?: string | null;
}

/** UIDs must be globally unique (RFC 5545 3.8.4.7), so plan-local ids are scoped by the event id (QA-07). */
function vevent(item: CalendarItem, eventId: string, stamp: string): string[] {
  const { start, end } = item;
  const when =
    start && end
      ? // An end time earlier than the start runs past midnight.
        [`DTSTART:${istToUtc(item.date, start)}`, `DTEND:${istToUtc(end <= start ? addDays(item.date, 1) : item.date, end)}`]
      : [`DTSTART;VALUE=DATE:${compact(item.date)}`, `DTEND;VALUE=DATE:${compact(addDays(item.date, 1))}`];
  return [
    "BEGIN:VEVENT",
    `UID:${eventId}-${item.uid}@utsav`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${escapeIcsText(item.summary)}`,
    `DESCRIPTION:${escapeIcsText(item.description)}`,
    "END:VEVENT",
  ];
}

/**
 * "Add to calendar" (spec 5.9, F-16): the event day, each function (timed when it has start and end
 * times), every open task on its due date including the after-event tasks, and each vendor's
 * book-by date while it is still open. Never vendor labels, contacts or notes.
 */
export function buildIcs(plan: EventDoc, eventId: string, today: string, now: Date = new Date()): string {
  const stamp = utcStamp(now);
  const view = deriveView(plan, today);
  const name = plan.details.title || defaultEventTitle(plan.details);
  const items: CalendarItem[] = [
    { uid: "event", summary: name, description: plan.summary.text, date: plan.details.eventDate },
    ...plan.functions.map((fn) => ({
      uid: fn.id,
      summary: `${fn.name} · ${name}`,
      description: fn.highlights.join("; "),
      date: fn.date,
      start: fn.startTime,
      end: fn.endTime,
    })),
    ...view.tasks
      .filter((task) => !task.done)
      .map((task) => ({ uid: task.id, summary: `To do: ${task.title}`, description: `Category: ${task.category}`, date: task.dueDate })),
    ...view.vendors
      .filter((v) => v.status === "to_research" || v.status === "contacted" || v.status === "quoted")
      .map((v) => ({ uid: v.id, summary: `Book ${v.category}`, description: v.questions.join("; "), date: v.bookBy })),
  ];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Utsav//Event Planner//EN",
    "CALSCALE:GREGORIAN",
    ...items.flatMap((item) => vevent(item, eventId, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A safe file name for the download: "utsav-ananya-rohan-wedding.ics". */
export function icsFileName(plan: EventDoc): string {
  const slug = (plan.details.title || defaultEventTitle(plan.details))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `utsav-${slug || "event"}.ics`;
}
