import { LIMITS } from "./schemas";

const DAY_MS = 86_400_000;

/** Parses a YYYY-MM-DD string as a UTC calendar date. */
export function parseIsoDate(iso: string): Date {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${iso}`);
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in India, which is where events are planned. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS));
}

/** Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / DAY_MS);
}

/** Returns an error message if the event date cannot be planned for, otherwise null. */
export function validateEventDate(eventDate: string, today: string): string | null {
  const lead = daysBetween(today, eventDate);
  if (lead < 0) return "The event date is in the past";
  if (lead > LIMITS.maxPlanningDays) return "Pick a date within the next two years";
  return null;
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The given weekday on or before the event date, e.g. "friday" is the Friday of the event week. */
export function resolveWeekday(eventDate: string, weekday: Weekday): string {
  const back = (parseIsoDate(eventDate).getUTCDay() - WEEKDAYS.indexOf(weekday) + 7) % 7;
  return addDays(eventDate, -back);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a 24-hour "HH:mm" clock time. */
export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

export function formatDisplayDate(iso: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(iso));
}

/** English weekday name for a calendar date, e.g. "Mon" or "Monday". */
export function weekdayName(iso: string, style: "short" | "long" = "short"): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: style, timeZone: "UTC" }).format(parseIsoDate(iso));
}

/** "Mon 14 Dec 2026": the date format used on cards and in diffs. */
export function formatWeekdayDate(iso: string): string {
  return `${weekdayName(iso)} ${formatDisplayDate(iso)}`;
}

/** "Fri 6 Nov": the compact date used in rows, cards and diffs. */
export function formatShortDate(iso: string): string {
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(parseIsoDate(iso));
  return `${weekdayName(iso)} ${day}`;
}

/** "19:00" -> "7:00 pm". */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

/** "30 days before", "Event day", "1 day after" for a signed offset from the event. */
export function offsetLabel(daysBefore: number): string {
  if (daysBefore === 0) return "Event day";
  const n = Math.abs(daysBefore);
  return `${n} ${n === 1 ? "day" : "days"} ${daysBefore > 0 ? "before" : "after"}`;
}
